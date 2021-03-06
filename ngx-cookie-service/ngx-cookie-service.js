import { Inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

// This service is based on the `ng2-cookies` package which sadly is not a service and does
// not use `DOCUMENT` injection and therefore doesn't work well with AoT production builds.
// Package: https://github.com/BCJTI/ng2-cookies
class CookieService {
    /**
     * @param {?} document
     * @param {?} platformId
     */
    constructor(document, platformId) {
        this.document = document;
        this.platformId = platformId;
        this.documentIsAccessible = isPlatformBrowser(this.platformId);
    }
    /**
     * @param {?} name Cookie name
     * @return {?}
     */
    check(name) {
        if (!this.documentIsAccessible) {
            return false;
        }
        name = encodeURIComponent(name);
        const /** @type {?} */ regExp = this.getCookieRegExp(name);
        const /** @type {?} */ exists = regExp.test(this.document.cookie);
        return exists;
    }
    /**
     * @param {?} name Cookie name
     * @return {?}
     */
    get(name) {
        if (this.documentIsAccessible && this.check(name)) {
            name = encodeURIComponent(name);
            const /** @type {?} */ regExp = this.getCookieRegExp(name);
            const /** @type {?} */ result = regExp.exec(this.document.cookie);
            return decodeURIComponent(result[1]);
        }
        else {
            return '';
        }
    }
    /**
     * @return {?}
     */
    getAll() {
        if (!this.documentIsAccessible) {
            return {};
        }
        const /** @type {?} */ cookies = {};
        const /** @type {?} */ document = this.document;
        if (document.cookie && document.cookie !== '') {
            const /** @type {?} */ split = document.cookie.split(';');
            for (let /** @type {?} */ i = 0; i < split.length; i += 1) {
                const /** @type {?} */ currentCookie = split[i].split('=');
                currentCookie[0] = currentCookie[0].replace(/^ /, '');
                cookies[decodeURIComponent(currentCookie[0])] = decodeURIComponent(currentCookie[1]);
            }
        }
        return cookies;
    }
    /**
     * @param {?} name     Cookie name
     * @param {?} value    Cookie value
     * @param {?=} expires  Number of days until the cookies expires or an actual `Date`
     * @param {?=} path     Cookie path
     * @param {?=} domain   Cookie domain
     * @param {?=} secure   Secure flag
     * @param {?=} sameSite OWASP samesite token `Lax`, `None`, or `Strict`. Defaults to `None`
     * @return {?}
     */
    set(name, value, expires, path, domain, secure, sameSite = 'None') {
        if (!this.documentIsAccessible) {
            return;
        }
        let /** @type {?} */ cookieString = encodeURIComponent(name) + '=' + encodeURIComponent(value) + ';';
        if (expires) {
            if (typeof expires === 'number') {
                const /** @type {?} */ dateExpires = new Date(new Date().getTime() + expires * 1000 * 60 * 60 * 24);
                cookieString += 'expires=' + dateExpires.toUTCString() + ';';
            }
            else {
                cookieString += 'expires=' + expires.toUTCString() + ';';
            }
        }
        if (path) {
            cookieString += 'path=' + path + ';';
        }
        if (domain) {
            cookieString += 'domain=' + domain + ';';
        }
        if (secure) {
            cookieString += 'secure;';
        }
        cookieString += 'sameSite=' + sameSite + ';';
        this.document.cookie = cookieString;
    }
    /**
     * @param {?} name   Cookie name
     * @param {?=} path   Cookie path
     * @param {?=} domain Cookie domain
     * @return {?}
     */
    delete(name, path, domain) {
        if (!this.documentIsAccessible) {
            return;
        }
        this.set(name, '', new Date('Thu, 01 Jan 1970 00:00:01 GMT'), path, domain);
    }
    /**
     * @param {?=} path   Cookie path
     * @param {?=} domain Cookie domain
     * @return {?}
     */
    deleteAll(path, domain) {
        if (!this.documentIsAccessible) {
            return;
        }
        const /** @type {?} */ cookies = this.getAll();
        for (const /** @type {?} */ cookieName in cookies) {
            if (cookies.hasOwnProperty(cookieName)) {
                this.delete(cookieName, path, domain);
            }
        }
    }
    /**
     * @param {?} name Cookie name
     * @return {?}
     */
    getCookieRegExp(name) {
        const /** @type {?} */ escapedName = name.replace(/([\[\]\{\}\(\)\|\=\;\+\?\,\.\*\^\$])/ig, '\\$1');
        return new RegExp('(?:^' + escapedName + '|;\\s*' + escapedName + ')=(.*?)(?:;|$)', 'g');
    }
}
CookieService.decorators = [
    { type: Injectable },
];
/**
 * @nocollapse
 */
CookieService.ctorParameters = () => [
    { type: undefined, decorators: [{ type: Inject, args: [DOCUMENT,] },] },
    { type: InjectionToken, decorators: [{ type: Inject, args: [PLATFORM_ID,] },] },
];

/**
 * Generated bundle index. Do not edit.
 */

export { CookieService };
//# sourceMappingURL=ngx-cookie-service.js.map
