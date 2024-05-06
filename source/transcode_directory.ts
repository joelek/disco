import * as libcp from "child_process";
import * as libfs from "fs";
import * as libpath from "path";

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
	let metadata = {
		"type": "album",
		"title": "Album Title",
		"disc": 0,
		"year": 0,
		"artists": [
			"Album Artist"
		],
		"tracks": <Array<{ title: string; artists: Array<string>; }>> []
	};
	for (let file of files) {
		let filename = file.name.toLowerCase();
		let extension = libpath.extname(filename);
		let basename = filename.slice(0, filename.length - extension.length);
		if ([".wav", ".ogg", ".flac", ".mp3", ".mp4"].includes(extension)) {
			metadata.tracks.push({
				title: basename,
				artists: [
					"Track Artist"
				]
			});
			await transcodeAudio(filename, `./output/${metadata.tracks.length.toString().padStart(2, "0")}-${basename.replaceAll(" ", "_")}.mp3`);
			continue;
		}
		if ([".jpg", ".jpeg", ".png", ".bmp"].includes(extension)) {
			await transcodeImage(filename, "./output/00-artwork.jpg");
			continue;
		}
	}
	libfs.writeFileSync("./output/00-metadata.json", JSON.stringify(metadata, null, "\t"));
};

run();
