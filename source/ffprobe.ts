import * as libcp from "child_process";
import * as stream_types from "./stream_types";
import * as tesseract from "./tesseract";

interface Callback<A> {
	(value: A): void
}

function getStreams(path: string, cb: Callback<Array<stream_types.StreamType>>): void {
	let options = [
		"ffprobe",
		"-v", "quiet",
		"-show_streams",
		"-show_data",
		"-print_format", "json",
		path
	];
	libcp.exec(options.join(" "), (error, stdout, stderr) => {
		let json = JSON.parse(stdout);
		let ffprobe = stream_types.FFProbe.as(json);
		let streams = ffprobe.streams;
		return cb(streams);
	});
}

function getAudioStreams(path: string, cb: Callback<Array<stream_types.AudioStream>>): void {
	getStreams(path, (streams) => {
		let audio_streams = streams.filter((stream): stream is stream_types.AudioStream => stream_types.AudioStream.is(stream));
		return cb(audio_streams);
	});
}

function getAudioStreamsToKeep(path: string, cb: Callback<Array<stream_types.AudioStream>>): void {
	let target_languages = ["swe", "eng", "jpn"];
	getAudioStreams(path, (audio_streams) => {
		let streams = target_languages.map((target_language) => {
				return audio_streams.filter((stream) => {
					if (stream.tags.language !== target_language) {
						return false;
					}
					return true;
				}).sort((one, two) => {
					if (one.channels > two.channels) {
						return -1;
					}
					if (one.channels < two.channels) {
						return 1;
					}
					if (one.sample_rate > two.sample_rate) {
						return -1;
					}
					if (one.sample_rate < two.sample_rate) {
						return 1;
					}
					return 0;
				});
			}).filter((items) => {
				return items.length >= 1;
			}).map((items) => {
				return items[0];
			});
		if (streams.length === 0) {
			return cb(audio_streams.slice(0, 1));
		}
		return cb(streams);
	});
}

function getSubtitleStreams(path: string, cb: Callback<Array<stream_types.SubtitleStream>>): void {
	getStreams(path, (streams) => {
		let subtitles_stream = streams.filter((stream): stream is stream_types.SubtitleStream => stream_types.SubtitleStream.is(stream));
		return cb(subtitles_stream);
	});
}

function getSubtitleStreamsToKeep(path: string, cb: Callback<Array<stream_types.SubtitleStream>>): void {
	let target_languages = ["swe", "eng", "jpn"];
	tesseract.getSupportedLanguages((supported_languages) => {
		getSubtitleStreams(path, (subtitle_streams) => {
			let streams = target_languages.map((target_language) => {
					return subtitle_streams.filter((stream) => {
						if (stream.tags.language !== target_language) {
							return false;
						}
						if (stream.codec_name === "dvd_subtitle" || stream.codec_name === "hdmv_pgs_subtitle") {
							if (supported_languages.indexOf(target_language) === -1) {
								return false;
							}
						}
						return true;
					}).sort((one, two) => {
						if (one.codec_name === "subrip") {
							if (two.codec_name === "subrip") {
								return 0;
							} else {
								return -1;
							}
						} else {
							if (two.codec_name === "subrip") {
								return 1;
							} else {
								return 0;
							}
						}
					});
				}).filter((items) => {
					return items.length >= 1;
				}).map((items) => {
					return items[0];
				});
			return cb(streams);
		});
	});
}

function getVideoStreams(path: string, cb: Callback<Array<stream_types.VideoStream>>): void {
	getStreams(path, (streams) => {
		let video_streams = streams.filter((stream): stream is stream_types.VideoStream => stream_types.VideoStream.is(stream));
		return cb(video_streams);
	});
}

function getVideoStreamsToKeep(path: string, cb: Callback<Array<stream_types.VideoStream>>): void {
	getVideoStreams(path, (video_streams) => {
		let streams = video_streams;
		return cb(streams);
	});
}

async function getVideoStream(path: string): Promise<stream_types.VideoStream> {
	return new Promise((resolve, reject) => {
		getVideoStreamsToKeep(path, (video_streams) => {
			if (video_streams.length !== 1) {
				return reject("Expected exactly one video stream!");
			}
			return resolve(video_streams[0]);
		});
	});
}

export {
	getAudioStreamsToKeep,
	getSubtitleStreamsToKeep,
	getVideoStreamsToKeep,
	getVideoStream
};
