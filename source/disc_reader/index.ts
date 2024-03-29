// This file was auto-generated by @joelek/ts-autoguard. Edit at own risk.

import * as autoguard from "@joelek/ts-autoguard/dist/lib-shared";

export const DeviceDetails: autoguard.serialization.MessageGuard<DeviceDetails> = autoguard.guards.Object.of({
	"vendor_id": autoguard.guards.String,
	"product_id": autoguard.guards.String
}, {});

export type DeviceDetails = autoguard.guards.Object<{
	"vendor_id": autoguard.guards.String,
	"product_id": autoguard.guards.String
}, {}>;

export namespace Autoguard {
	export const Guards = {
		"DeviceDetails": autoguard.guards.Reference.of(() => DeviceDetails)
	};

	export type Guards = { [A in keyof typeof Guards]: ReturnType<typeof Guards[A]["as"]>; };

	export const Requests = {};

	export type Requests = { [A in keyof typeof Requests]: ReturnType<typeof Requests[A]["as"]>; };

	export const Responses = {};

	export type Responses = { [A in keyof typeof Responses]: ReturnType<typeof Responses[A]["as"]>; };
};
