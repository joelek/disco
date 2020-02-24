import * as libcp from "child_process";

interface Callback<A> {
	(value: A): void
}

function getSupportedLanguages(cb: Callback<Array<string>>): void {
	let options = [
		"tesseract",
		"--list-langs"
	];
	libcp.exec(options.join(" "), (error, stdout, stderr) => {
		let lines = stdout.split(/\r\n|\n\r|\n|\r/)
			.map((line) => {
				return line.trim();
			})
			.filter((line) => {
				return line.length === 3;
			});
		return cb(lines);
	});
}

export {
	getSupportedLanguages
};
