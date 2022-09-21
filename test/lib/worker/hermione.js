'use strict';

const _ = require('lodash');
const pluginsLoader = require('plugins-loader');
const Config = require('build/config');
const RunnerEvents = require('build/constants/runner-events');
const Errors = require('build/errors');
const TestCollection = require('build/test-collection');
const WorkerRunnerEvents = require('build/worker/constants/runner-events');
const Hermione = require('build/worker/hermione');
const Runner = require('build/worker/runner');
const {makeConfigStub, makeSuite} = require('../../utils');

describe('worker/hermione', () => {
    const sandbox = sinon.sandbox.create();

    beforeEach(() => {
        sandbox.stub(Config, 'create').returns(makeConfigStub());

        sandbox.stub(pluginsLoader, 'load');

        sandbox.spy(Runner, 'create');
        sandbox.stub(Runner.prototype, 'runTest');
    });

    afterEach(() => sandbox.restore());

    describe('constructor', () => {
        it('should create a config from the passed path', () => {
            Hermione.create('some-config-path.js');

            assert.calledOnceWith(Config.create, 'some-config-path.js');
        });

        it('should create a runner instance', () => {
            Config.create.returns({some: 'config'});

            Hermione.create();

            assert.calledOnceWith(Runner.create, {some: 'config'});
        });

        it('should passthrough all runner events', () => {
            const hermione = Hermione.create();

            _.forEach({
                [WorkerRunnerEvents.BEFORE_FILE_READ]: {suite: makeSuite()},
                [WorkerRunnerEvents.AFTER_FILE_READ]: {suite: makeSuite()},
                [WorkerRunnerEvents.AFTER_TESTS_READ]: Object.create(TestCollection.prototype),
                [WorkerRunnerEvents.NEW_BROWSER]: {id: 'someBro'},
                [WorkerRunnerEvents.UPDATE_REFERENCE]: {path: '/ref/path'}
            }, (data, event) => {
                const spy = sinon.spy();
                hermione.on(event, spy);

                Runner.create.returnValues[0].emit(event, data);

                assert.calledOnceWith(spy, data);
            });
        });

        describe('loading of plugins', () => {
            it('should load plugins', () => {
                Hermione.create();

                assert.calledOnce(pluginsLoader.load);
            });

            it('should load plugins for hermione instance', () => {
                Hermione.create();

                assert.calledWith(pluginsLoader.load, sinon.match.instanceOf(Hermione));
            });

            it('should load plugins from config', () => {
                Config.create.returns(makeConfigStub({plugins: {'some-plugin': true}}));

                Hermione.create();

                assert.calledWith(pluginsLoader.load, sinon.match.any, {'some-plugin': true});
            });

            it('should load plugins with appropriate prefix', () => {
                Hermione.create();

                assert.calledWith(pluginsLoader.load, sinon.match.any, sinon.match.any, 'hermione-');
            });
        });
    });

    describe('should provide access to', () => {
        it('hermione events', () => {
            const expectedEvents = _.extend({}, RunnerEvents, WorkerRunnerEvents);

            assert.deepEqual(Hermione.create(makeConfigStub()).events, expectedEvents);
        });

        it('hermione configuration', () => {
            const config = {foo: 'bar'};

            Config.create.returns(config);

            assert.deepEqual(Hermione.create().config, config);
        });

        it('hermione errors', () => {
            assert.deepEqual(Hermione.create().errors, Errors);
        });
    });

    describe('init', () => {
        it('should emit "INIT"', () => {
            const hermione = Hermione.create();

            const onInit = sinon.spy();
            hermione.on(WorkerRunnerEvents.INIT, onInit);

            return hermione.init()
                .then(() => assert.calledOnce(onInit));
        });

        it('should reject on "INIT" handler fail', () => {
            const hermione = Hermione.create()
                .on(WorkerRunnerEvents.INIT, () => Promise.reject('o.O'));

            return assert.isRejected(hermione.init(), /o.O/);
        });
    });

    describe('runTest', () => {
        it('should run test', () => {
            Runner.prototype.runTest.withArgs('fullTitle', {some: 'options'}).resolves('foo bar');

            const hermione = Hermione.create();

            return hermione.runTest('fullTitle', {some: 'options'})
                .then((result) => assert.equal(result, 'foo bar'));
        });
    });

    describe('isWorker', () => {
        it('should return "true"', () => {
            const hermione = Hermione.create();

            assert.isTrue(hermione.isWorker());
        });
    });
});
