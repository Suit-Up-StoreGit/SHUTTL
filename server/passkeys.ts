import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "./database.ts";
import {
  Service,
  requireThat,
  passwordMatches,
  hash,
  now,
  Problem,
} from "./service.ts";

export function registerPasskeys(
  app: FastifyInstance,
  db: Database,
  service: Service,
  origin: string,
  authenticate: (reply: any, user: string) => any,
) {
  const url = new URL(origin),
    rpID = url.hostname;
  const available =
    !isIP(rpID) &&
    !rpID.includes(":") &&
    (url.protocol === "https:" || rpID === "localhost");
  const limit = {
    config: { rateLimit: { max: 12, timeWindow: "15 minutes" } },
  };
  function activeSession(req: any) {
    requireThat(
      db.get(
        "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.user_id=? AND s.expires>? AND u.deleted=0",
        req.sessionToken,
        req.actor.id,
        now(),
      ),
      "Your session changed. Sign in again.",
      401,
    );
  }
  function challenge(
    kind: string,
    owner: string | null,
    session: string | null,
    value: string,
  ) {
    db.run("DELETE FROM passkey_challenges WHERE expires<?", now());
    if (owner)
      db.run(
        "DELETE FROM passkey_challenges WHERE owner=? AND kind=?",
        owner,
        kind,
      );
    const token = randomBytes(24).toString("base64url");
    db.run(
      "INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)",
      hash(token),
      owner,
      session,
      kind,
      value,
      new Date(Date.now() + 120000).toISOString(),
    );
    return token;
  }
  function take(token: string, kind: string, session?: string, owner?: string) {
    const row = db.get(
      "SELECT * FROM passkey_challenges WHERE id=? AND kind=? AND expires>?",
      hash(token),
      kind,
      now(),
    );
    requireThat(
      row &&
        (!session || row.session_hash === session) &&
        (!owner || row.owner === owner),
      "This passkey request expired. Start again.",
      400,
    );
    db.run("DELETE FROM passkey_challenges WHERE id=?", hash(token));
    return row;
  }
  app.get("/api/account/passkeys", async (req) => ({
    available,
    passkeys: db.all(
      "SELECT id,label,created_at AS createdAt,last_used AS lastUsed FROM passkeys WHERE owner=? ORDER BY created_at",
      req.actor.id,
    ),
  }));
  app.post("/api/account/passkeys/options", limit, async (req) => {
    requireThat(
      available,
      "Passkeys need HTTPS or a local development origin.",
    );
    const input = z
      .object({ password: z.string().max(128) })
      .strict()
      .parse(req.body);
    requireThat(
      await passwordMatches(input.password, req.actor.password),
      "Your password is incorrect.",
      401,
    );
    requireThat(
      db.get("SELECT count(*) AS n FROM passkeys WHERE owner=?", req.actor.id)!
        .n < 10,
      "Remove an unused passkey before adding another.",
    );
    const options = await generateRegistrationOptions({
      rpName: "SHUTTL",
      rpID,
      userName: req.actor.username,
      userID: Buffer.from(req.actor.id),
      userDisplayName: req.actor.name,
      attestationType: "none",
      supportedAlgorithmIDs: [-7, -257],
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: db
        .all("SELECT id,transports FROM passkeys WHERE owner=?", req.actor.id)
        .map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
    });
    activeSession(req);
    return {
      options,
      challengeId: challenge(
        "register",
        req.actor.id,
        req.sessionToken,
        options.challenge,
      ),
    };
  });
  app.post("/api/account/passkeys/verify", limit, async (req) => {
    const input = z
      .object({
        challengeId: z.string().max(100),
        response: z.any(),
        label: z.string().trim().min(1).max(40),
      })
      .strict()
      .parse(req.body);
    const request = take(
      input.challengeId,
      "register",
      req.sessionToken,
      req.actor.id,
    );
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: request.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
    } catch {
      throw new Problem(400, "The passkey could not be verified. Start again.");
    }
    requireThat(verification.verified, "The passkey could not be verified.");
    activeSession(req);
    const credential = verification.registrationInfo.credential;
    db.run(
      "INSERT INTO passkeys VALUES(?,?,?,?,?,?,?,NULL)",
      credential.id,
      req.actor.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports || []),
      input.label,
      now(),
    );
    service.audit(req.actor.id, "passkey.added", req.actor.id, {});
    return { ok: true };
  });
  app.delete("/api/account/passkeys/:id", limit, async (req) => {
    const input = z
      .object({ password: z.string().max(128) })
      .strict()
      .parse(req.body);
    requireThat(
      await passwordMatches(input.password, req.actor.password),
      "Your password is incorrect.",
      401,
    );
    activeSession(req);
    db.run(
      "DELETE FROM passkeys WHERE id=? AND owner=?",
      (req.params as any).id,
      req.actor.id,
    );
    return { ok: true };
  });
  app.post("/api/auth/passkey/options", limit, async (req, reply) => {
    z.object({}).strict().parse(req.body);
    requireThat(
      available,
      "Passkeys need HTTPS or a local development origin.",
    );
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    const token = challenge("login", null, null, options.challenge);
    reply.setCookie("shuttl_passkey", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: url.protocol === "https:",
      path: "/api/auth/passkey",
      maxAge: 120,
    });
    return { options };
  });
  app.post("/api/auth/passkey/verify", limit, async (req, reply) => {
    const input = z.object({ response: z.any() }).strict().parse(req.body);
    const token = req.cookies.shuttl_passkey;
    requireThat(token, "This passkey request expired. Start again.");
    const request = take(token, "login");
    reply.clearCookie("shuttl_passkey", { path: "/api/auth/passkey" });
    const response = input.response;
    requireThat(
      response && typeof response.id === "string" && response.id.length <= 2048,
      "The passkey could not be verified.",
    );
    const credential = db.get(
      "SELECT p.*,u.deleted FROM passkeys p JOIN users u ON u.id=p.owner WHERE p.id=?",
      response.id,
    );
    requireThat(
      credential && !credential.deleted,
      "The passkey could not be verified.",
      401,
    );
    requireThat(
      response.response?.userHandle &&
        Buffer.from(response.response.userHandle, "base64url").toString() ===
          credential.owner,
      "The passkey could not be verified.",
      401,
    );
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: request.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.public_key),
          counter: credential.counter,
          transports: JSON.parse(credential.transports),
        },
      });
    } catch {
      throw new Problem(401, "The passkey could not be verified. Start again.");
    }
    requireThat(
      verification.verified,
      "The passkey could not be verified.",
      401,
    );
    db.transaction(() => {
      requireThat(
        db.get("SELECT counter FROM passkeys WHERE id=?", credential.id)
          ?.counter === credential.counter,
        "Your passkey changed. Try again.",
        409,
      );
      db.run(
        "UPDATE passkeys SET counter=?,last_used=? WHERE id=?",
        verification.authenticationInfo.newCounter,
        now(),
        credential.id,
      );
    });
    return authenticate(reply, credential.owner);
  });
}
