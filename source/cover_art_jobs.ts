import * as libfs from "fs";
import * as cddb from "./cddb";
import * as job from "./job";
import * as tidal from "./tidal";
import * as utils from "./utils";
import * as rate_limiter from "./rate_limiter";

async function getMetadata(database: cddb.Database, basename: string): Promise<{
	id: string,
	index: number,
	media: cddb.Disc,
	track: cddb.Track
}> {
	const parts = basename.split(".");
	if (parts.length === 3) {
		const id = parts[0];
		const media = database[id];
		if (media != null) {
			const index = Number.parseInt(parts[1]);
			const track = media.tracks[index];
			if (track != null) {
				return {
					id,
					index,
					media,
					track
				};
			}
		}
	}
	throw "Unable to get metadata!";
}

const rl = new rate_limiter.RateLimiter(10000);

async function createJobListRecursively(database: cddb.Database, directories: Array<string>): Promise<Array<job.PromiseJob>> {
	const jobs = new Array<job.PromiseJob>();
	const entries = await libfs.promises.readdir(directories.join("/"), {
		withFileTypes: true
	});
	for (const entry of entries) {
		const basename = entry.name;
		if (entry.isDirectory()) {
			jobs.push(...await createJobListRecursively(database, [
				...directories,
				basename
			]));
			continue;
		}
		if (entry.isFile() && basename.endsWith(".wav")) {
			async function perform(): Promise<void> {
				const metadata = await getMetadata(database, basename);
				const paths = [
					...directories,
					metadata.id
				];
				const path = paths.join("/") + ".jpg";
				if (!libfs.existsSync(path)) {
					if (metadata.media.cover_art_url != null) {
						console.log(path);
						libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
						await rl.rateLimit();
						const buffer = await utils.request(metadata.media.cover_art_url);
						libfs.writeFileSync(path, buffer);
					}
				}
			}
			jobs.push({
				perform
			});
			continue;
		}
	}
	return jobs;
}

async function createJobList(): Promise<Array<job.PromiseJob>> {
	const database = utils.loadDatabase("./private/db/cddb.json", cddb.Database.as);
	return createJobListRecursively(database, [
		".",
		"private",
		"archive",
		"audio"
	]);
}

export {
	createJobList
};
