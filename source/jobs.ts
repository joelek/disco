import * as libfs from 'fs';
import * as libpath from 'path';
import * as vobsub from './vobsub';
import * as ffmpeg from './ffmpeg';
import { MediaContent, MediaDatabase, MediaType } from './discdb';
import * as utils from './utils';

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
	} else if (stat.isFile() && /[.]mkv$/.test(node)) {
		files.push(node);
	}
	return files;
};

let queue = generate_queue([], './private/queue/');

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

let pick_from_queue = (): void => {
	if (queue.length > 0) {
		let index = (Math.random() * queue.length) | 0;
		let input = queue.splice(index, 1)[0];
		const mi = get_media_info(input);
		if (mi != null) {
			if (mi.type === 'dvd' || mi.type === 'bluray') {
				vobsub.generateJobs(input, mi.type, mi.content, (vobsub_jobs) => {
					ffmpeg.generateJobs(input, mi.type, mi.content, (ffmpeg_jobs) => {
						let jobs = [...vobsub_jobs, ...ffmpeg_jobs];
						utils.foreach(jobs, (job, next) => {
							const path = job.getArtifactPath();
							if (libfs.existsSync("./private/media/" + path)) {
								console.log("Artifact exists: " + path);
								next();
							} else {
								job.produceArtifact((path) => {
									console.log("Produced artifact: " + path);
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
		pick_from_queue();
	} else {
		process.exit(0);
	}
};

pick_from_queue();