"use strict";

const Promise = require("bluebird");
const RuntimeConfig = require("../../../config/runtime-config");
const logger = require("../../../utils/logger");

module.exports = class ExecutionThread {
    static create(...args) {
        return new this(...args);
    }

    constructor({ test, browser, hermioneCtx, screenshooter }) {
        this._hermioneCtx = hermioneCtx;
        this._screenshooter = screenshooter;
        this._ctx = {
            browser: browser.publicAPI,
            currentTest: test,
        };

        this._runtimeConfig = RuntimeConfig.getInstance();
        this._isReplBeforeTestOpened = false;
    }

    async run(runnable) {
        console.log('RUN runnable:', runnable);
        // console.log('JSON runnable:', runnable.toJSON());
        // console.log('STRINGIFY runnable:', JSON.stringify(runnable));

        this._setExecutionContext(
            Object.assign(runnable, {
                hermioneCtx: this._hermioneCtx,
                ctx: this._ctx,
            }),
        );

        try {
            await this._call(runnable);
        } catch (err) {
            this._ctx.currentTest.err = this._ctx.currentTest.err || err;

            throw err;
        } finally {
            this._setExecutionContext(null);
        }
    }

    async _call(runnable) {
        const { replMode } = this._runtimeConfig;

        if (replMode?.beforeTest && !this._isReplBeforeTestOpened) {
            await this._ctx.browser.switchToRepl();
            this._isReplBeforeTestOpened = true;
        }

        let fnPromise = Promise.method(runnable.fn).call(this._ctx, this._ctx);

        if (runnable.timeout) {
            const msg = `'${runnable.fullTitle()}' timed out after ${runnable.timeout} ms`;
            fnPromise = fnPromise.timeout(runnable.timeout, msg);
        }

        return fnPromise
            .tapCatch(async e => {
                if (replMode?.onFail) {
                    logger.log("Caught error:", e);
                    await this._ctx.browser.switchToRepl();
                }

                return this._screenshooter.extendWithScreenshot(e);
            })
            .finally(async () => {
                if (this._hermioneCtx.assertViewResults && this._hermioneCtx.assertViewResults.hasFails()) {
                    await this._screenshooter.captureScreenshotOnAssertViewFail();
                }
            });
    }

    _setExecutionContext(context) {
        Object.getPrototypeOf(this._ctx.browser).executionContext = context;
    }
};
