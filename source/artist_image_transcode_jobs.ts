import * as libcp from "child_process";
import * as libfs from "fs";
import * as job from "./job";
import * as utils from "./utils";
import * as tidaldb from "./tidal/db";

type ArtistMetadata = {
	type: "artist";
	name: string;
	tidal?: number;
};

async function getArtist(database: tidaldb.Database, basename: string): Promise<{
	id: number;
	artist: tidaldb.Artist;
}> {
	const parts = basename.split(".");
	if (parts.length === 2) {
		const id = Number.parseInt(parts[0]);
		const media = database.artists.find((artist) => artist.id === id);
		if (media != null) {
			return {
				id,
				artist: media
			};
		}
	}
	throw "Unable to get metadata!";
}

async function getArtworkPath(artist: tidaldb.Artist): Promise<Array<string>> {
	const artist_name = utils.pathify(artist.name);
	return [
		".",
		"private",
		"media",
		"audio",
		`${artist_name}`,
		`00-artwork`,
	];
}

async function getMetadataPath(artist: tidaldb.Artist): Promise<Array<string>> {
	const artist_name = utils.pathify(artist.name);
	return [
		".",
		"private",
		"media",
		"audio",
		`${artist_name}`,
		`00-metadata`,
	];
}

async function writeBufferToDisk(buffer: Buffer, path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const options = [
			"-i", "pipe:",
			"-vf", [
				"scale=w=540:h=540:force_original_aspect_ratio=increase",
				"crop=540:540",
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

function getArtistMetadata(artist: tidaldb.Artist): ArtistMetadata {
	return {
		type: "artist",
		name: artist.name,
		tidal: artist.id
	};
}

async function createJobListRecursively(database: tidaldb.Database, directories: Array<string>): Promise<Array<job.PromiseJob>> {
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
			jobs.push({
				async perform() {
					const artist = await getArtist(database, basename);
					const paths = await getArtworkPath(artist.artist);
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
			});
			jobs.push({
				async perform() {
					const artist = await getArtist(database, basename);
					const paths = await getMetadataPath(artist.artist);
					const path = paths.join("/") + ".json";
					if (!libfs.existsSync(path)) {
						console.log(path);
						libfs.mkdirSync(paths.slice(0, -1).join("/"), { recursive: true });
						const json = getArtistMetadata(artist.artist);
						libfs.writeFileSync(path, JSON.stringify(json, null, "\t") + "\n");
					}
				}
			});
			continue;
		}
	}
	return jobs;
}

async function createJobList(): Promise<Array<job.PromiseJob>> {
	const database = utils.loadDatabase("./private/db/tidal.json", tidaldb.Database.as);
	return createJobListRecursively(database, [
		".",
		"private",
		"archive",
		"image",
		"artists"
	]);
}

export {
	createJobList
};
