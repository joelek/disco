import { Reader } from "./reader";

class Identifier {
	readonly name: string;

	static parse(reader: Reader): Identifier {
		let string = "";
		if (reader.peek(1) === "-") {
			string = reader.read(1);
		}

		return null;
	}
}

abstract class NamespacePrefix {
	static parse(reader: Reader): NamespacePrefix {
		return reader.try<NamespacePrefix>([
			NoNamespacePrefix.parse,
			WildcardNamespacePrefix.parse,
			NamedNamespacePrefix.parse
		]);
	}
}

class NoNamespacePrefix extends NamespacePrefix {
	constructor(readonly state: Readonly<{
	}>) {
		super();
	}

	static parse(reader: Reader): WildcardNamespacePrefix {
		reader.read("|");
		return new NoNamespacePrefix({});
	}
}

class WildcardNamespacePrefix extends NamespacePrefix {
	constructor(readonly state: Readonly<{
	}>) {
		super();
	}

	static parse(reader: Reader): WildcardNamespacePrefix {
		reader.read("*|");
		return new WildcardNamespacePrefix({});
	}
}

class NamedNamespacePrefix extends NamespacePrefix {
	constructor(readonly state: Readonly<{
		identifier: Identifier
	}>) {
		super();
	}

	static parse(reader: Reader): NamedNamespacePrefix {
		let identifier = Identifier.parse(reader);
		reader.read("|");
		return new NamedNamespacePrefix({
			identifier
		});
	}
}

let reader = new Reader("");
