"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const child_process_1 = require("child_process");
const path_1 = require("path");
const semver = require("semver");
const ts = require("typescript");
const proxyquire = require("proxyquire");
const index_1 = require("./index");
const TEST_DIR = path_1.join(__dirname, '../tests');
const PROJECT = path_1.join(TEST_DIR, 'tsconfig.json');
const BIN_EXEC = `node "${path_1.join(__dirname, '../dist/bin')}" --project "${PROJECT}"`;
const SCRIPT_EXEC = `node "${path_1.join(__dirname, '../dist/script')}"`;
const SOURCE_MAP_REGEXP = /\/\/# sourceMappingURL=data:application\/json;charset=utf\-8;base64,[\w\+]+=*$/;
describe('ts-node', function () {
    this.timeout(10000);
    it('should export the correct version', function () {
        chai_1.expect(index_1.VERSION).to.equal(require('../package.json').version);
    });
    describe('cli', function () {
        this.slow(1000);
        it('should execute cli', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/hello-world`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, world!\n');
                return done();
            });
        });
        it('should register via cli', function (done) {
            child_process_1.exec(`node -r ../register hello-world.ts`, {
                cwd: TEST_DIR
            }, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, world!\n');
                return done();
            });
        });
        it('should execute cli with absolute path', function (done) {
            child_process_1.exec(`${BIN_EXEC} "${path_1.join(TEST_DIR, 'hello-world')}"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, world!\n');
                return done();
            });
        });
        it('should print scripts', function (done) {
            child_process_1.exec(`${BIN_EXEC} -pe "import { example } from './tests/complex/index';example()"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('example\n');
                return done();
            });
        });
        it('should provide registered information globally', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/env`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('object\n');
                return done();
            });
        });
        it('should provide registered information on register', function (done) {
            child_process_1.exec(`node -r ../register env.ts`, {
                cwd: TEST_DIR
            }, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('object\n');
                return done();
            });
        });
        if (semver.gte(ts.version, '1.8.0')) {
            it('should allow js', function (done) {
                child_process_1.exec([
                    BIN_EXEC,
                    '-O "{\\\"allowJs\\\":true}"',
                    '-pe "import { main } from \'./tests/allow-js/run\';main()"'
                ].join(' '), function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    chai_1.expect(stdout).to.equal('hello world\n');
                    return done();
                });
            });
            it('should include jsx when `allow-js` true', function (done) {
                child_process_1.exec([
                    BIN_EXEC,
                    '-O "{\\\"allowJs\\\":true}"',
                    '-pe "import { Foo2 } from \'./tests/allow-js/with-jsx\'; Foo2.sayHi()"'
                ].join(' '), function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    chai_1.expect(stdout).to.equal('hello world\n');
                    return done();
                });
            });
        }
        it('should eval code', function (done) {
            child_process_1.exec(`${BIN_EXEC} -e "import * as m from './tests/module';console.log(m.example('test'))"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('TEST\n');
                return done();
            });
        });
        it('should import empty files', function (done) {
            child_process_1.exec(`${BIN_EXEC} -e "import './tests/empty'"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('');
                return done();
            });
        });
        it('should throw errors', function (done) {
            child_process_1.exec(`${BIN_EXEC} -e "import * as m from './tests/module';console.log(m.example(123))"`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.match(new RegExp('TS2345: Argument of type \'(?:number|123)\' ' +
                    'is not assignable to parameter of type \'string\'\\.'));
                return done();
            });
        });
        it('should be able to ignore diagnostic', function (done) {
            child_process_1.exec(`${BIN_EXEC} --ignore-diagnostics 2345 -e "import * as m from './tests/module';console.log(m.example(123))"`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.match(/TypeError: (?:(?:undefined|foo\.toUpperCase) is not a function|.*has no method \'toUpperCase\')/);
                return done();
            });
        });
        it('should work with source maps', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/throw`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.contain([
                    `${path_1.join(__dirname, '../tests/throw.ts')}:3`,
                    '  bar () { throw new Error(\'this is a demo\') }',
                    '                 ^',
                    'Error: this is a demo'
                ].join('\n'));
                return done();
            });
        });
        it('eval should work with source maps', function (done) {
            child_process_1.exec(`${BIN_EXEC} -pe "import './tests/throw'"`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.contain([
                    `${path_1.join(__dirname, '../tests/throw.ts')}:3`,
                    '  bar () { throw new Error(\'this is a demo\') }',
                    '                 ^'
                ].join('\n'));
                return done();
            });
        });
        it('should support transpile only mode', function (done) {
            child_process_1.exec(`${BIN_EXEC} --transpile-only -pe "x"`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.contain('ReferenceError: x is not defined');
                return done();
            });
        });
        it('should throw error even in transpileOnly mode', function (done) {
            child_process_1.exec(`${BIN_EXEC} --transpile-only -pe "console."`, function (err) {
                if (err === null) {
                    return done('Command was expected to fail, but it succeeded.');
                }
                chai_1.expect(err.message).to.contain('error TS1003: Identifier expected');
                return done();
            });
        });
        it('should pipe into `ts-node` and evaluate', function (done) {
            const cp = child_process_1.exec(BIN_EXEC, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('hello\n');
                return done();
            });
            cp.stdin.end("console.log('hello')");
        });
        it('should pipe into `ts-node`', function (done) {
            const cp = child_process_1.exec(`${BIN_EXEC} -p`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('true\n');
                return done();
            });
            cp.stdin.end('true');
        });
        it('should pipe into an eval script', function (done) {
            const cp = child_process_1.exec(`${BIN_EXEC} --transpile-only -pe 'process.stdin.isTTY'`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('undefined\n');
                return done();
            });
            cp.stdin.end('true');
        });
        it('should support require flags', function (done) {
            child_process_1.exec(`${BIN_EXEC} -r ./tests/hello-world -pe "console.log('success')"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, world!\nsuccess\nundefined\n');
                return done();
            });
        });
        it('should support require from node modules', function (done) {
            child_process_1.exec(`${BIN_EXEC} -r typescript -e "console.log('success')"`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('success\n');
                return done();
            });
        });
        it.skip('should use source maps with react tsx', function (done) {
            child_process_1.exec(`${BIN_EXEC} -r ./tests/emit-compiled.ts tests/jsx-react.tsx`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('todo');
                return done();
            });
        });
        it('should allow custom typings', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/custom-types`, function (err, stdout) {
                chai_1.expect(err).to.match(/Error: Cannot find module 'does-not-exist'/);
                return done();
            });
        });
        it('should preserve `ts-node` context with child process', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/child-process`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, world!\n');
                return done();
            });
        });
        it('should import js before ts by default', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/import-order/compiled`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, JavaScript!\n');
                return done();
            });
        });
        it('should import ts before js when --prefer-ts-exts flag is present', function (done) {
            child_process_1.exec(`${BIN_EXEC} --prefer-ts-exts tests/import-order/compiled`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, TypeScript!\n');
                return done();
            });
        });
        it('should import ts before js when TS_NODE_PREFER_TS_EXTS env is present', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/import-order/compiled`, { env: Object.assign(Object.assign({}, process.env), { TS_NODE_PREFER_TS_EXTS: 'true' }) }, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, TypeScript!\n');
                return done();
            });
        });
        it('should ignore .d.ts files', function (done) {
            child_process_1.exec(`${BIN_EXEC} tests/import-order/importer`, function (err, stdout) {
                chai_1.expect(err).to.equal(null);
                chai_1.expect(stdout).to.equal('Hello, World!\n');
                return done();
            });
        });
        if (semver.gte(ts.version, '2.7.0')) {
            it('should support script mode', function (done) {
                child_process_1.exec(`${SCRIPT_EXEC} tests/scope/a/log`, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    chai_1.expect(stdout).to.equal('.ts\n');
                    return done();
                });
            });
        }
        describe('should read ts-node options from tsconfig.json', function () {
            const BIN_EXEC = `node "${path_1.join(__dirname, '../dist/bin')}" --project tests/tsconfig-options/tsconfig.json`;
            it('should override compiler options from env', function (done) {
                child_process_1.exec(`${BIN_EXEC} tests/tsconfig-options/log-options.js`, {
                    env: Object.assign(Object.assign({}, process.env), { TS_NODE_COMPILER_OPTIONS: '{"typeRoots": ["env-typeroots"]}' })
                }, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    const { config } = JSON.parse(stdout);
                    chai_1.expect(config.options.typeRoots).to.deep.equal([path_1.join(__dirname, '../tests/tsconfig-options/env-typeroots')]);
                    return done();
                });
            });
            it('should use options from `tsconfig.json`', function (done) {
                child_process_1.exec(`${BIN_EXEC} tests/tsconfig-options/log-options.js`, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    const { options, config } = JSON.parse(stdout);
                    chai_1.expect(config.options.typeRoots).to.deep.equal([path_1.join(__dirname, '../tests/tsconfig-options/tsconfig-typeroots')]);
                    chai_1.expect(config.options.types).to.deep.equal(['tsconfig-tsnode-types']);
                    chai_1.expect(options.pretty).to.equal(undefined);
                    chai_1.expect(options.skipIgnore).to.equal(false);
                    chai_1.expect(options.transpileOnly).to.equal(true);
                    return done();
                });
            });
            it('should have flags override `tsconfig.json`', function (done) {
                child_process_1.exec(`${BIN_EXEC} --skip-ignore --compiler-options '{"types": ["flags-types"]}' tests/tsconfig-options/log-options.js`, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    const { options, config } = JSON.parse(stdout);
                    chai_1.expect(config.options.typeRoots).to.deep.equal([path_1.join(__dirname, '../tests/tsconfig-options/tsconfig-typeroots')]);
                    chai_1.expect(config.options.types).to.deep.equal(['flags-types']);
                    chai_1.expect(options.pretty).to.equal(undefined);
                    chai_1.expect(options.skipIgnore).to.equal(true);
                    chai_1.expect(options.transpileOnly).to.equal(true);
                    return done();
                });
            });
            it('should have `tsconfig.json` override environment', function (done) {
                child_process_1.exec(`${BIN_EXEC} tests/tsconfig-options/log-options.js`, {
                    env: Object.assign(Object.assign({}, process.env), { TS_NODE_PRETTY: 'true', TS_NODE_SKIP_IGNORE: 'true' })
                }, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    const { options, config } = JSON.parse(stdout);
                    chai_1.expect(config.options.typeRoots).to.deep.equal([path_1.join(__dirname, '../tests/tsconfig-options/tsconfig-typeroots')]);
                    chai_1.expect(config.options.types).to.deep.equal(['tsconfig-tsnode-types']);
                    chai_1.expect(options.pretty).to.equal(true);
                    chai_1.expect(options.skipIgnore).to.equal(false);
                    chai_1.expect(options.transpileOnly).to.equal(true);
                    return done();
                });
            });
        });
        describe('compiler host', function () {
            it('should execute cli', function (done) {
                child_process_1.exec(`${BIN_EXEC} --compiler-host tests/hello-world`, function (err, stdout) {
                    chai_1.expect(err).to.equal(null);
                    chai_1.expect(stdout).to.equal('Hello, world!\n');
                    return done();
                });
            });
            it('should give ts error for invalid node_modules', function (done) {
                child_process_1.exec(`${BIN_EXEC} --compiler-host --skip-ignore tests/from-node-modules`, function (err, stdout) {
                    if (err === null)
                        return done('Expected an error');
                    chai_1.expect(err.message).to.contain('Unable to compile file from external library');
                    return done();
                });
            });
        });
    });
    describe('register', function () {
        const registered = index_1.register({
            project: PROJECT,
            compilerOptions: {
                jsx: 'preserve'
            }
        });
        const moduleTestPath = require.resolve('../tests/module');
        afterEach(() => {
            // Re-enable project after every test.
            registered.enabled(true);
        });
        it('should be able to require typescript', function () {
            const m = require(moduleTestPath);
            chai_1.expect(m.example('foo')).to.equal('FOO');
        });
        it('should support dynamically disabling', function () {
            delete require.cache[moduleTestPath];
            chai_1.expect(registered.enabled(false)).to.equal(false);
            chai_1.expect(() => require(moduleTestPath)).to.throw(/Unexpected token/);
            delete require.cache[moduleTestPath];
            chai_1.expect(registered.enabled()).to.equal(false);
            chai_1.expect(() => require(moduleTestPath)).to.throw(/Unexpected token/);
            delete require.cache[moduleTestPath];
            chai_1.expect(registered.enabled(true)).to.equal(true);
            chai_1.expect(() => require(moduleTestPath)).to.not.throw();
            delete require.cache[moduleTestPath];
            chai_1.expect(registered.enabled()).to.equal(true);
            chai_1.expect(() => require(moduleTestPath)).to.not.throw();
        });
        if (semver.gte(ts.version, '2.7.0')) {
            it('should support compiler scopes', function () {
                const calls = [];
                registered.enabled(false);
                const compilers = [
                    index_1.register({ dir: path_1.join(TEST_DIR, 'scope/a'), scope: true }),
                    index_1.register({ dir: path_1.join(TEST_DIR, 'scope/b'), scope: true })
                ];
                compilers.forEach(c => {
                    const old = c.compile;
                    c.compile = (code, fileName, lineOffset) => {
                        calls.push(fileName);
                        return old(code, fileName, lineOffset);
                    };
                });
                try {
                    chai_1.expect(require('../tests/scope/a').ext).to.equal('.ts');
                    chai_1.expect(require('../tests/scope/b').ext).to.equal('.ts');
                }
                finally {
                    compilers.forEach(c => c.enabled(false));
                }
                chai_1.expect(calls).to.deep.equal([
                    path_1.join(TEST_DIR, 'scope/a/index.ts'),
                    path_1.join(TEST_DIR, 'scope/b/index.ts')
                ]);
                delete require.cache[moduleTestPath];
                chai_1.expect(() => require(moduleTestPath)).to.throw();
            });
        }
        it('should compile through js and ts', function () {
            const m = require('../tests/complex');
            chai_1.expect(m.example()).to.equal('example');
        });
        it('should work with proxyquire', function () {
            const m = proxyquire('../tests/complex', {
                './example': 'hello'
            });
            chai_1.expect(m.example()).to.equal('hello');
        });
        it('should work with `require.cache`', function () {
            const { example1, example2 } = require('../tests/require-cache');
            chai_1.expect(example1).to.not.equal(example2);
        });
        it('should use source maps', function (done) {
            try {
                require('../tests/throw');
            }
            catch (error) {
                chai_1.expect(error.stack).to.contain([
                    'Error: this is a demo',
                    `    at Foo.bar (${path_1.join(__dirname, '../tests/throw.ts')}:3:18)`
                ].join('\n'));
                done();
            }
        });
        describe('JSX preserve', () => {
            let old = require.extensions['.tsx']; // tslint:disable-line
            let compiled;
            before(function () {
                require.extensions['.tsx'] = (m, fileName) => {
                    const _compile = m._compile;
                    m._compile = (code, fileName) => {
                        compiled = code;
                        return _compile.call(this, code, fileName);
                    };
                    return old(m, fileName);
                };
            });
            after(function () {
                require.extensions['.tsx'] = old; // tslint:disable-line
            });
            it('should use source maps', function (done) {
                try {
                    require('../tests/with-jsx.tsx');
                }
                catch (error) {
                    chai_1.expect(error.stack).to.contain('SyntaxError: Unexpected token');
                }
                chai_1.expect(compiled).to.match(SOURCE_MAP_REGEXP);
                done();
            });
        });
    });
    describe('create', () => {
        it('should create generic compiler instances', () => {
            const service = index_1.create({ compilerOptions: { target: 'es5' }, skipProject: true });
            const output = service.compile('const x = 10', 'test.ts');
            chai_1.expect(output).to.contain('var x = 10;');
        });
    });
});
//# sourceMappingURL=index.spec.js.map