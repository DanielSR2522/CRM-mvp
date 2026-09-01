import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const PUBLIC_ROUTES = ['/login', '/register'];
const PROTECTED_ROUTES = [
  '/dashboard',
  '/personal-information',
  '/agent-information',
  '/clients',
  '/leads',
  '/consents',
  '/calendar',
  '/carrier-portals',
];

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a local smoke-test port.'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl: string, server: ChildProcess, logs: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before smoke tests started.\n${logs()}`);
    }
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js.\n${logs()}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => server.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function run(): Promise<void> {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  let output = '';

  const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ci-anon-placeholder',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, server, () => output);
    const documentHeaders = {
      accept: 'text/html',
      'sec-fetch-dest': 'document',
    };

    for (const route of PUBLIC_ROUTES) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: documentHeaders,
        redirect: 'manual',
      });
      assert.equal(response.status, 200, `${route} should be publicly reachable.`);
      assert.equal(response.headers.get('location'), null, `${route} unexpectedly redirected.`);
    }

    for (const route of PROTECTED_ROUTES) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: documentHeaders,
        redirect: 'manual',
      });
      assert.equal(response.status, 307, `${route} must reject unauthenticated document navigation.`);
      const location = response.headers.get('location');
      assert.ok(location, `${route} returned no login redirect location.`);
      assert.equal(new URL(location, baseUrl).pathname, '/login', `${route} must redirect to /login.`);
    }

    console.log(
      `Application smoke tests passed (${PUBLIC_ROUTES.length} public, ${PROTECTED_ROUTES.length} protected routes).`
    );
  } finally {
    await stopServer(server);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
