import * as libcp from "child_process";
import * as libfs from "fs";
import * as discdb from "./discdb";
import * as job from "./job";
import * as utils from "./utils";

async function getTargetPaths(media: discdb.Media, track: discdb.EpisodeContent): Promise<Array<string>> {
	const show = utils.pathify(track.show);
	const title = utils.pathify(track.title);
	const season = ("00" + track.season).slice(-2);
	const episode = ("00" + track.episode).slice(-2);
	const suffix = utils.pathify(media.type);
	return [
		".",
		"private",
		"media",
		"video",
		"shows",
		`${show}`,
		`s${season}`,
		`${show}-s${season}e${episode}-${title}-${suffix}`,
		"00-artwork",
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
		if (entry.isFile() && basename.endsWith(".jpg")) {
			let parts = basename.split(".");
			if (parts.length !== 2) {
				continue;
			}
			let imdb_show = parts[0];
			for (let value of Object.values(database)) {
				if (value == null) {
					continue;
				}
				let media = value;
				for (let content of media.content) {
					if (discdb.EpisodeContent.is(content)) {
						let track = content;
						if (track.imdb_show !== imdb_show) {
							continue;
						}
						async function perform(): Promise<void> {
							const paths = await getTargetPaths(media, track);
							const path = paths.join("/") + ".jpg";
							if (!libfs.existsSync(path)) {
								console.log(path);
								const buffer = libfs.readFileSync([
									...directories,
									basename
								].join("/"));
								libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
								await writeBufferToDisk(buffer, path);
							}
						}
						jobs.push({
							perform
						});
					}
				}
			}
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
		"image",
		"shows"
	]);
}

export {
	createJobList
};
