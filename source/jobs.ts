import * as libfs from 'fs';
import * as libpath from 'path';
import * as vobsub from './vobsub';
import * as ffmpeg from './ffmpeg';
import { MediaContent, MediaDatabase, MediaType } from './discdb';
import * as utils from './utils';
import * as audio_jobs from './audio_jobs';
import * as cover_art_jobs from './cover_art_jobs';
import * as cover_art_transcode_jobs from './cover_art_transcode_jobs';
import * as poster_jobs from './poster_jobs';
import * as poster_transcode_jobs from './poster_transcode_jobs';

let move_files = (filenames: string[], basename: string): void => {
	basename = libpath.join(basename);
	let target_directory = ['.', 'private', 'media', ...basename.split(libpath.sep)];
	target_directory.pop();
	libfs.mkdirSync(target_directory.join(libpath.sep), { recursive: true });
	filenames.forEach((filename) => {
		filename = libpath.join(filename);
		let dirs = filename.split(libpath.sep);
		let file = dirs.pop() as string;
		let parts = file.split('.');
		let ending = parts.slice(2).join('.');
		libfs.renameSync(filename, libpath.join('.', 'private', 'media', basename + '.' + ending));
	});
};

let generate_queue = (files: Array<string>, node: string): Array<string> => {
	let stat = libfs.statSync(node);
	if (stat.isDirectory()) {
		libfs.readdirSync(node).map((subnode) => {
			return libpath.join(node, subnode);
		}).map((node) => {
			return generate_queue(files, node);
		});
	} else if (stat.isFile()) {
		files.push(node);
	}
	return files;
};

let queue = new Array<string>();

let db = MediaDatabase.as(JSON.parse(libfs.readFileSync("./private/db/discdb.json", "utf8")));

let get_media_info = (path: string): { type: MediaType, content: MediaContent } | null => {
	let parts = libpath.basename(path).split(".");
	if (parts.length === 3) {
		let discid = parts[0];
		let index = Number.parseInt(parts[1]);
		let media = db[discid];
		if (media != null) {
			let content = media.content[index];
			if (content != null) {
				return {
					type: media.type,
					content
				};
			}
		}
	}
	return null;
};

function checkForJobs() {
	queue = generate_queue([], './private/archive/audio/');
	pick_from_queue();
}

let pick_from_queue = (): void => {
	if (queue.length > 0) {
		let index = (Math.random() * queue.length) | 0;
		index = 0;
		let input = queue.splice(index, 1)[0];
		const mi = get_media_info(input);
		if (mi != null) {
			if (mi.type === 'paldvd' || mi.type === "ntscdvd" || mi.type === 'bluray') {
				vobsub.generateJobs(input, mi.type, mi.content, (vobsub_jobs) => {
					ffmpeg.generateJobs(input, mi.type, mi.content, (ffmpeg_jobs) => {
						let jobs = [...vobsub_jobs, ...ffmpeg_jobs];
						utils.foreach(jobs, (job, next) => {
							const path = job.getArtifactPath();
							libfs.mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
							if (libfs.existsSync(path)) {
								next();
							} else {
								job.produceArtifact((path) => {
									console.log(path);
									next();
								});
							}
						}, () => {
							pick_from_queue();
						});
					});
				});
			}
			return;
		}
		audio_jobs.createJobList(input)
			.then(async (jobs) => {
				for (let job of jobs) {
					try {
						await job.perform();
					} catch (error) {}
				}
			})
			.finally(() => {
				pick_from_queue();
			});
	} else {
		(async () => {
			let jobs = [
				...await poster_jobs.createJobList(),
				...await poster_transcode_jobs.createJobList(),
				...await cover_art_jobs.createJobList(),
				...await cover_art_transcode_jobs.createJobList()
			];
			for (let job of jobs) {
				try {
					await job.perform();
				} catch (error) {}
			}
			process.exit(0);
		})();
	}
};

checkForJobs();
