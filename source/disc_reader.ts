// This file was auto-generated by @joelek/ts-autoguard. Edit at own risk.

import * as autoguard from "@joelek/ts-autoguard";

export type DeviceDetails = {
	vendor_id: string,
	product_id: string
};

export const DeviceDetails = {
	as(subject: any, path: string = ""): DeviceDetails {
		return ((subject, path) => {
			if ((subject != null) && (subject.constructor === globalThis.Object)) {
				(autoguard.guards.String.as)(subject.vendor_id, path + "." + "vendor_id");
				(autoguard.guards.String.as)(subject.product_id, path + "." + "product_id");
				return subject;
			}
			throw "Type guard \"Object\" failed at \"" + path + "\"!";
		})(subject, path);
	},
	is(subject: any): subject is DeviceDetails {
		try {
			DeviceDetails.as(subject);
		} catch (error) {
			return false;
		}
		return true;
	}
};

export type Autoguard = {
	DeviceDetails: DeviceDetails
};

export const Autoguard = {
	DeviceDetails: DeviceDetails
};