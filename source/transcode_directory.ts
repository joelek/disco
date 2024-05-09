import * as libcp from "child_process";
import * as libfs from "fs";
import * as libpath from "path";

async function getAudioMetadata(input: string): Promise<{
	album?: string;
	artist?: string;
	title?: string;
	genre?: string;
	track: string;
	date?: string;
}> {
	return new Promise((resolve, reject) => {
		let options = [
			"-i", input,
			"-of", "json",
			"-show_entries", "format_tags"
		];
		let stdout = libcp.execFileSync("ffprobe", options, { encoding: "utf-8" });
		let json = JSON.parse(stdout);
		resolve(json?.format?.tags ?? {});
	});
};

async function transcodeAudio(input: string, output: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let options = [
			"-i", input,
			"-f", "mp3",
			"-vn",
			"-fflags", "+bitexact",
			"-movflags", "+faststart",
			"-c:a", input.endsWith(".mp3") ? "copy" : "mp3",
			"-q:a", "2",
			"-map_metadata", "-1",
			output, "-y"
		];
		let ffmpeg = libcp.spawn("ffmpeg", options);
		ffmpeg.on("error", reject);
		ffmpeg.on("close", resolve);
	});
};

async function transcodeImage(input: string, output: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let options = [
			"-i", input,
			"-vf", [
				"scale=w=540:h=720:force_original_aspect_ratio=increase",
				"crop=540:720",
				"setsar=1:1"
			].join(","),
			"-q:v", "1",
			"-f", "singlejpeg",
			"-fflags", "+bitexact",
			"-map_metadata", "-1",
			output, "-y"
		];
		let ffmpeg = libcp.spawn("ffmpeg", options);
		ffmpeg.on("error", reject);
		ffmpeg.on("close", resolve);
	});
};

async function run(): Promise<void> {
	libfs.mkdirSync("./output/", { recursive: true });
	let files = libfs.readdirSync("./", { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.sort((one, two) => one.name.toLowerCase().localeCompare(two.name));
	let album = {
		"type": "album",
		"title": "Album Title",
		"disc": {
			"number": 1,
			"title": "Disc Title"
		},
		"year": 0,
		"artists": [
			"Album Artist"
		],
		"genres": [
			"Genre"
		],
		"tracks": <Array<{ title: string; artists: Array<string>; }>> []
	};
	for (let file of files) {
		let filename = file.name.toLowerCase();
		let extension = libpath.extname(filename);
		let basename = filename.slice(0, filename.length - extension.length);
		if ([".wav", ".ogg", ".flac", ".mp3", ".mp4"].includes(extension)) {
			let metadata = await getAudioMetadata(filename);
			album.title = metadata.album != null ? metadata.album.trim() : album.title;
			album.artists = metadata.artist != null ? metadata.artist.split(";").map((artist) => artist.trim()) : album.artists;
			album.genres = metadata.genre != null ? metadata.genre.split(";").map((genre) => genre.trim()) : album.genres;
			album.year = metadata.date != null ? new Date(metadata.date).getFullYear() : album.year;
			album.tracks.push({
				title: metadata.title != null ? metadata.title.trim() : basename.replaceAll("_", " ").replaceAll(".", " "),
				artists: [
					metadata.artist ?? "Track Artist"
				]
			});
			await transcodeAudio(filename, `./output/${album.tracks.length.toString().padStart(2, "0")}-${basename.replaceAll(" ", "_")}.mp3`);
			continue;
		}
		if ([".jpg", ".jpeg", ".png", ".bmp"].includes(extension)) {
			await transcodeImage(filename, "./output/00-artwork.jpg");
			continue;
		}
	}
	libfs.writeFileSync("./output/00-metadata.json", JSON.stringify(album, null, "\t"));
};

run();
