import * as libcp from "child_process";
import * as libfs from "fs";
import * as cddb from "./cddb";
import * as job from "./job";
import * as utils from "./utils";

async function getMetadata(database: cddb.Database, basename: string): Promise<{
	id: string,
	media: cddb.Disc
}> {
	const parts = basename.split(".");
	if (parts.length === 2) {
		const id = parts[0];
		const media = database[id];
		if (media != null) {
			return {
				id,
				media
			};
		}
	}
	throw "Unable to get metadata!";
}

async function getPaths(media: cddb.Disc): Promise<Array<string>> {
	const disc_artist = utils.pathify(media.artists.join("; "));
	const disc_year = ("0000" + media.year).slice(-4);
	const disc_title = utils.pathify(media.title);
	const disc_number = ("00" + media.number).slice(-2);
	const suffix = "cd";
	return [
		".",
		"private",
		"media",
		"audio",
		`${disc_artist}`,
		`${disc_artist}-${disc_year}-${disc_title}-${disc_number}-${suffix}`,
		`00-artwork`,
	];
}

async function writeBufferToDisk(buffer: Buffer, path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const options = [
			"-i", "pipe:",
			"-vf", [
				"scale=w=1080:h=1080:force_original_aspect_ratio=increase",
				"crop=1080:1080",
				"setsar=1:1"
			].join(","),
			"-q:v", "1",
			"-f", "singlejpeg",
			"-fflags", "+bitexact",
			"-map_metadata", "-1",
			path, "-y"
		];
		const ffmpeg = libcp.spawn("ffmpeg", options);
		ffmpeg.on("error", reject);
		ffmpeg.on("close", resolve);
		ffmpeg.stdin.end(buffer);
	});
}

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
		if (entry.isFile() && basename.endsWith(".jpg")) {
			async function perform(): Promise<void> {
				const metadata = await getMetadata(database, basename);
				const paths = await getPaths(metadata.media);
				const path = paths.join("/") + ".jpg";
				if (!libfs.existsSync(path)) {
					console.log(path);
					const buffer = libfs.readFileSync([
						...directories,
						basename
					].join("/"));
					await writeBufferToDisk(buffer, path);
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
