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

function recognizeText(path: string, language: string, cb: { (lines: Array<string>): void }): void {
	let options = [
		"tesseract",
		path,
		"stdout",
		"--psm", "6",
		"--oem", "1",
		"-l", language,
		"quiet"
	];
	libcp.exec(options.join(" "), (error, stdout, stderr) => {
		if (error) {
			return cb([]);
		}
		let lines = stdout.split(/\r\n|\n\r|\n|\r/)
			.map((line) => {
				return line.trim();
			})
			.filter((line) => {
				return line.length > 0;
			})
			.map((line) => {
				line = line.replace(/\|/g, "I");
				line = line.replace(/\~/g, "-");
				line = line.replace(/\=/g, "-");
				line = line.replace(/\«/g, "-");
				line = line.replace(/\»/g, "-");
				line = line.replace(/\{/g, "(");
				line = line.replace(/\}/g, ")");
				line = line.replace(/\-+/g, "-");
				line = line.replace(/\'+/g, "'");
				line = line.replace(/\"+/g, "\"");
				line = line.replace(/^(-?)l /g, "$1I ");
				line = line.replace(/^(-?)1 ([^0-9])/g, "$1I $2");
				return line;
			});
		return cb(lines);
	});
}

export {
	getSupportedLanguages,
	recognizeText
};
