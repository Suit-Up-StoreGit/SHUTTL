import { Database } from "./database.ts";
import { Service } from "./service.ts";
import { CATEGORIES } from "../src/domain.ts";
const db = new Database(),
  service = new Service(db);
try {
  for (const category of CATEGORIES)
    console.log(JSON.stringify(service.rebuild(category)));
} finally {
  db.close();
}
