// This file was auto-generated by @joelek/ts-autoguard. Edit at own risk.

import * as autoguard from "@joelek/ts-autoguard/dist/lib-shared";

export const Album: autoguard.serialization.MessageGuard<Album> = autoguard.guards.Object.of({
	"id": autoguard.guards.Number,
	"title": autoguard.guards.String,
	"cover": autoguard.guards.String,
	"release_date": autoguard.guards.Number,
	"artists": autoguard.guards.Array.of(autoguard.guards.Object.of({
		"id": autoguard.guards.Number
	}, {}))
}, {});

export type Album = autoguard.guards.Object<{
	"id": autoguard.guards.Number,
	"title": autoguard.guards.String,
	"cover": autoguard.guards.String,
	"release_date": autoguard.guards.Number,
	"artists": autoguard.guards.Array<autoguard.guards.Object<{
		"id": autoguard.guards.Number
	}, {}>>
}, {}>;

export const Artist: autoguard.serialization.MessageGuard<Artist> = autoguard.guards.Object.of({
	"id": autoguard.guards.Number,
	"name": autoguard.guards.String
}, {
	"picture": autoguard.guards.String
});

export type Artist = autoguard.guards.Object<{
	"id": autoguard.guards.Number,
	"name": autoguard.guards.String
}, {
	"picture": autoguard.guards.String
}>;

export const Database: autoguard.serialization.MessageGuard<Database> = autoguard.guards.Object.of({
	"albums": autoguard.guards.Array.of(autoguard.guards.Reference.of(() => Album)),
	"artists": autoguard.guards.Array.of(autoguard.guards.Reference.of(() => Artist))
}, {});

export type Database = autoguard.guards.Object<{
	"albums": autoguard.guards.Array<autoguard.guards.Reference<Album>>,
	"artists": autoguard.guards.Array<autoguard.guards.Reference<Artist>>
}, {}>;

export namespace Autoguard {
	export const Guards = {
		"Album": autoguard.guards.Reference.of(() => Album),
		"Artist": autoguard.guards.Reference.of(() => Artist),
		"Database": autoguard.guards.Reference.of(() => Database)
	};

	export type Guards = { [A in keyof typeof Guards]: ReturnType<typeof Guards[A]["as"]>; };

	export const Requests = {};

	export type Requests = { [A in keyof typeof Requests]: ReturnType<typeof Requests[A]["as"]>; };

	export const Responses = {};

	export type Responses = { [A in keyof typeof Responses]: ReturnType<typeof Responses[A]["as"]>; };
};