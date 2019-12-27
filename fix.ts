import * as libfs from "fs";
import { foreach } from "./utils";
import { MediaDatabase } from "./discdb";
import * as imdb from "./metadata";

let db = MediaDatabase.as(JSON.parse(libfs.readFileSync("./private/db/discdb.json", "utf8")));

foreach(Object.values(db), (value, next) => {
	foreach(value.content, (content, next) => {
		next();
	}, next);
}, () => {
	libfs.writeFileSync("./private/db/discdb.json", JSON.stringify(db, null, "\t"), "utf8");
});
