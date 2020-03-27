import * as libfs from "fs";
import * as discdb from "./discdb";
import * as job from "./job";
import * as utils from "./utils";
import * as rate_limiter from "./rate_limiter";

async function getMetadata(database: discdb.MediaDatabase, basename: string): Promise<{
	id: string,
	index: number,
	media: discdb.Media,
	track: discdb.MediaContent
}> {
	const parts = basename.split(".");
	if (parts.length === 3) {
		const id = parts[0];
		const media = database[id];
		if (media != null) {
			const index = Number.parseInt(parts[1]);
			const track = media.content[index];
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

async function createJobListRecursively(database: discdb.MediaDatabase, directories: Array<string>): Promise<Array<job.PromiseJob>> {
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
		if (entry.isFile() && basename.endsWith(".mkv")) {
			async function perform(): Promise<void> {
				const metadata = await getMetadata(database, basename);
				const track = discdb.MovieContent.as(metadata.track);
				const paths = [
					".",
					"private",
					"archive",
					"image",
					metadata.id
				];
				const path = paths.join("/") + ".jpg";
				if (!libfs.existsSync(path)) {
					console.log(path);
					libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
					await rl.rateLimit();
					const buffer = await utils.request(track.poster_url);
					libfs.writeFileSync(path, buffer);
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
	const database = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);
	return createJobListRecursively(database, [
		".",
		"private",
		"archive",
		"video"
	]);
}

export {
	createJobList
};
