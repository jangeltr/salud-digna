import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const source = (name) => readFileSync(new URL(`../src/omnichannel/${name}.ts`, import.meta.url), "utf8");
const contract = moduleUrl(stripTypeScriptTypes(source("contract")));
const flags = moduleUrl("export const constants = {O_RDONLY:0,O_NOFOLLOW:1,O_NONBLOCK:2,O_DIRECTORY:4}");
const process = moduleUrl("export default {platform:'linux',cwd:()=>'/repo/app',getgid:()=>100,getegid:()=>100,getuid:()=>101,geteuid:()=>101}");
const fs = moduleUrl("export const open=(...a)=>globalThis.consentFs.open(...a); export const realpath=async p=>p; export const lstat=async p=>p==='/repo/.git' ? {} : null;");
const { readAdvisorConsent } = await import(moduleUrl(stripTypeScriptTypes(source("automatic-continuity")
  .replace('"node:fs"', JSON.stringify(flags))
  .replace('"node:fs/promises"', JSON.stringify(fs))
  .replace('"node:process"', JSON.stringify(process))
  .replace('"./contract"', JSON.stringify(contract)))));

const advisor = "A784934A-040F-4ABD-8258-D4A03C883ACA";
const paths = ["/", "/proc/self/fd/10/private", "/proc/self/fd/11/consents",
  `/proc/self/fd/12/${advisor.toLowerCase()}.jws`];

function setup({ failure, statIndex, metadata, content = "a.b.c\n", readError, closeError } = {}) {
  const opened = [];
  const closed = [];
  globalThis.consentFs = {
    async open(path, flags) {
      const index = opened.length;
      assert.equal(path, paths[index]);
      assert.equal(flags, index < 3 ? 7 : 3);
      if (failure?.[0] === index) throw Object.assign(new Error(), { code: failure[1] });
      opened.push(index);
      return {
        fd: index + 10,
        async stat() {
          return { uid: 0, gid: 100, mode: index < 3 ? 0o750 : 0o640,
            isDirectory: () => index < 3, isFile: () => index === 3, size: content.length,
            ...(statIndex === index ? metadata : {}) };
        },
        async read(buffer, offset, size, position) {
          if (readError) throw new Error();
          const bytesRead = Buffer.from(content).copy(buffer, offset, position, position + Math.min(size, 3));
          return { bytesRead };
        },
        async close() {
          closed.push(index);
          if (closeError) throw new Error();
        },
      };
    },
  };
  return { opened, closed };
}

const cases = [
  ["missing consent", { failure: [3, "ENOENT"] }, 3],
  ["missing directory", { failure: [2, "ENOENT"] }, 2],
  ["writable ancestor", { statIndex: 1, metadata: { mode: 0o770 } }, 2],
  ["public directory", { statIndex: 2, metadata: { mode: 0o755 } }, 3],
  ["directory with wrong group", { statIndex: 2, metadata: { gid: 999 } }, 3],
  ["symlink in place of file", { failure: [3, "ELOOP"] }, 3],
  ["symlink in place of directory", { failure: [2, "ENOTDIR"] }, 2],
  ["special file", { statIndex: 3, metadata: { isFile: () => false } }, 4],
  ["group-writable file", { statIndex: 3, metadata: { mode: 0o660 } }, 4],
  ["file readable by others", { statIndex: 3, metadata: { mode: 0o644 } }, 4],
  ["file owned by non-root", { statIndex: 3, metadata: { uid: 101 } }, 4],
  ["file with wrong group", { statIndex: 3, metadata: { gid: 999 } }, 4],
  ["oversized file", { content: "a".repeat(2052) }, 4],
  ["file grows past bound after fstat", { statIndex: 3, metadata: { size: 5 }, content: "a".repeat(2052) }, 4],
  ["invalid JWS", { content: "invalid" }, 4],
  ["open failure", { failure: [3, "EACCES"] }, 3],
  ["read failure with close errors", { readError: true, closeError: true }, 4],
];

for (const [name, options, count] of cases) {
  test(name, async () => {
    const { opened, closed } = setup(options);
    assert.equal(await readAdvisorConsent("/private/consents", advisor), null);
    assert.equal(opened.length, count);
    assert.deepEqual(closed, opened.toReversed());
  });
}

test("valid consent, partial reads, and lowercase advisor filename", async () => {
  const { opened, closed } = setup();
  assert.equal(await readAdvisorConsent("/private/consents", advisor), "a.b.c");
  assert.equal(opened.length, 4);
  assert.deepEqual(closed, opened.toReversed());
});

test("invalid advisor and repository or client directory", async () => {
  const { opened } = setup();
  await assert.rejects(readAdvisorConsent("/private/consents", "../advisor"), /Invalid advisor/);
  assert.equal(await readAdvisorConsent("/repo/private", advisor), null);
  assert.equal(await readAdvisorConsent("/repo/app/public", advisor), null);
  assert.deepEqual(opened, []);
});
