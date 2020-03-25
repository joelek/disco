import * as libcp from "child_process";
import * as libfs from "fs";
import * as discdb from "./discdb";
import * as job from "./job";
import * as utils from "./utils";

async function getMetadata(database: discdb.MediaDatabase, basename: string): Promise<{
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
					media,
					track
				};
			}
		}
	}
	throw "Unable to get metadata!";
}

async function getTargetPaths(media: discdb.Media, track: discdb.MovieContent): Promise<Array<string>> {
	const title = utils.pathify(track.title);
	const year = ("0000" + track.year).slice(-4);
	const suffix = utils.pathify(media.type);
	const dir = title.substr(0, 1);
	const part = ("00" + 0).slice(-2);
	return [
		".",
		"private",
		"media",
		"video",
		"movies",
		`${dir}`,
		`${title}-${year}-${suffix}`,
		`${part}-${title}-${year}-${suffix}`,
	];
}

async function writeBufferToDisk(buffer: Buffer, path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const options = [
			"-i", "pipe:",
			"-vf", [
				"scale=w=720:h=1080:force_original_aspect_ratio=increase",
				"crop=720:1080",
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

async function createJobListRecursively(database: discdb.MediaDatabase, paths: Array<string>): Promise<Array<job.PromiseJob>> {
	const jobs = new Array<job.PromiseJob>();
	const entries = await libfs.promises.readdir(paths.join("/"), {
		withFileTypes: true
	});
	for (const entry of entries) {
		const basename = entry.name;
		if (entry.isDirectory()) {
			jobs.push(...await createJobListRecursively(database, [
				...paths,
				basename
			]));
			continue;
		}
		if (entry.isFile()) {
			async function perform(): Promise<void> {
				const metadata = await getMetadata(database, basename);
				const media = metadata.media;
				const track = discdb.MovieContent.as(metadata.track);
				const paths = await getTargetPaths(media, track);
				const path = paths.join("/") + ".jpg";
				if (!libfs.existsSync(path)) {
					console.log(path);
					libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
					const buffer = await utils.request(track.poster_url);
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
	const database = utils.loadDatabase("./private/db/discdb.json", discdb.MediaDatabase.as);
	return createJobListRecursively(database, [
		".",
		"private",
		"queue"
	]);
}

export {
	createJobList
};
