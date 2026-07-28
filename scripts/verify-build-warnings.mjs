const build = Bun.spawn(["bun", "run", "build"], {
  cwd: import.meta.dir.replace(/\/scripts$/, ""),
  env: process.env,
  stderr: "pipe",
  stdout: "pipe",
});

const [stdout, stderr, exitCode] = await Promise.all([
  new Response(build.stdout).text(),
  new Response(build.stderr).text(),
  build.exited,
]);

process.stdout.write(stdout);
process.stderr.write(stderr);

if (exitCode !== 0) {
  process.exit(exitCode);
}

const output = `${stdout}\n${stderr}`;
const forbiddenWarnings = [
  {
    label: "deprecated TanStack Start inputValidator usage",
    pattern: /createServerFn\(\)\.inputValidator\(\) is deprecated/,
  },
  {
    label: "route exports that prevent TanStack Router code splitting",
    pattern: /\[tanstack-router\][\s\S]*?will not be code-split/,
  },
];

const detectedWarnings = forbiddenWarnings.filter(({ pattern }) =>
  pattern.test(output),
);

if (detectedWarnings.length > 0) {
  console.error("\nBuild warning regression detected:");
  for (const { label } of detectedWarnings) {
    console.error(`- ${label}`);
  }
  process.exit(1);
}

console.log("\nBuild warning regression check passed.");
