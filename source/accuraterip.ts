import * as metadata from "./metadata";

type Entry = {
	vendor: string;
	product: string;
	roc: number;
};

async function getReadOffsetCorrectionEntries(): Promise<Array<Entry>> {
	let entries: Array<Entry> = [];
	let xml = await metadata.promiseXML("https://www.accuraterip.com/driveoffsets.htm");
	let rows = xml.querySelectorAll("tr");
	for (let row of rows) {
		let columns = Array.from(row.querySelectorAll("td"));
		if (columns.length >= 2) {
			let identifier = columns[0].getTrimmedText();
			let roc = columns[1].getTrimmedText();
			let identifier_parts = /^(.*) - (.*)$/.exec(identifier);
			let roc_parts = /^([+-][0-9]+)$/.exec(roc);
			if (identifier_parts != null && roc_parts != null) {
				let vendor = identifier_parts[1];
				let product = identifier_parts[2];
				let roc = Number.parseInt(roc_parts[1]);
				entries.push({
					vendor,
					product,
					roc
				});
			}
		}
	}
	return entries;
};

getReadOffsetCorrectionEntries().then((entries) => {
	console.log(entries.map(({ vendor, product, roc }) => `\"${vendor},${product},${roc}\\n\"`).join("\r\n"));
});
