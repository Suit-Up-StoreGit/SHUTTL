import { Database } from "./database.ts";
import { Service } from "./service.ts";
const username = process.argv[2];
if (!username) throw new Error("Usage: npm run admin -- registered_username");
const db = new Database(),
  service = new Service(db),
  user = db.get(
    "SELECT id FROM users WHERE username=? AND deleted=0 AND guest=0",
    username.toLowerCase(),
  );
if (!user) {
  db.close();
  throw new Error("Registered player not found.");
}
db.transaction(() => {
  db.run("UPDATE users SET role='reviewer' WHERE id=?", user.id);
  service.audit(null, "reviewer.granted", user.id, { source: "operator CLI" });
});
db.close();
console.log(
  "Reviewer access granted. Participants still cannot review their own results.",
);
