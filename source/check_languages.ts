/*
let streams = JSON.parse(libcp.spawnSync("ffprobe", [
		"-hide_banner",
		"-v", "quiet",
		"-of", "json",
		"-i", path,
		"-show_streams"
	]).stdout) as {
		"streams": Array<{
			"index": number;
			"codec_type": "video" | "audio";
			"disposition": {
				"default": 0 | 1;
			};
			"tags": {
				"language": "swe" | "eng" | "jpn";
			};
		}>;
	};
let video_streams = streams.streams.filter((stream) => stream.codec_type === "video");
let audio_streams = streams.streams.filter((stream) => stream.codec_type === "audio");
let order = md.settings.audio_languages ?? ["swe", "eng", "jpn"];
let entries = order
	.map((order, order_index) => {
		let audio_stream_index = audio_streams.findIndex((audio_stream) => audio_stream.tags.language === order);
		let audio_stream = audio_streams[audio_stream_index];
		return {
			order,
			audio_stream_index,
			order_index,
			audio_stream
		};
	})
	.filter((entry) => entry.audio_stream_index >= 0);
let needs_rewrite = false;
if (audio_streams[0].disposition.default === 0) {
	console.log(`${path} needs rewrite because first audio stream is not default`);
	needs_rewrite = true;
} else if (audio_streams.length > entries.length) {
	console.log(`${path} needs rewrite because it contains additional audio streams`);
	needs_rewrite = true;
} else {
	let current_stream_index = -1;
	for (let entry of entries) {
		if (entry.audio_stream_index < current_stream_index) {
			console.log(`${path} needs rewrite because streams are not in desired order`);
			needs_rewrite = true;
			break;
		}
		current_stream_index = entry.audio_stream_index;
	}
}
if (needs_rewrite) {
	let mappings: Array<string> = [];
	let k = 0;
	for (let entry of entries) {
		mappings.push("-map", "0:a:" + entry.audio_stream_index);
		mappings.push("-disposition:a:" + k, k === 0 ? "default" : "0");
		k += 1;
	}
	let cp = libcp.spawn("ffmpeg", [
		"-i", path,
		"-c", "copy",
		"-map", "0:v:0",
		...mappings,
		"-fflags", "+bitexact",
		"-movflags", "+faststart",
		`${path}.fixed.mp4`,
		"-n"
	]);
	cp.on('exit', () => {
		next();
	});
} else {
	next();
}
*/
