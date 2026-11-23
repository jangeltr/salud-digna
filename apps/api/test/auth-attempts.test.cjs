require('reflect-metadata');
const assert = require('node:assert/strict');
const { IncomingMessage, ServerResponse } = require('node:http');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const { Module, UnauthorizedException, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { AuthAttemptsGuard } = require('../dist/auth/auth-attempts.guard');
const { AuthController } = require('../dist/auth/auth.controller');
const { AuthService } = require('../dist/auth/auth.service');
const { CallCenterController } = require('../dist/call-center/call-center.controller');
const { CallCenterService } = require('../dist/call-center/call-center.service');
const { trustLocalProxy } = require('../dist/config/trust-local-proxy');

const advisor = { id: '00000000-0000-4000-8000-000000000001', role: 'ADVISOR' };
const code = 'a'.repeat(22);
const password = 'sintetica-para-pruebas';

async function startApi(t, verifyLogin = () => {}) {
  const jwt = new JwtService({ secret: 'firma-exclusiva-para-la-prueba-local', signOptions: { expiresIn: 60 } });
  const token = await jwt.signAsync({ sub: advisor.id, role: advisor.role });
  const auth = {
    async login(input) {
      if (input.email !== 'asesor@example.test') throw new UnauthorizedException();
      await verifyLogin();
      return { accessToken: token };
    },
    register: () => ({ id: 'paciente-sintetico' }),
    findActiveAccount: (id) => id === advisor.id ? advisor : null,
  };

  class AuthFixture {}
  Module({
    controllers: [AuthController],
    providers: [AuthAttemptsGuard, { provide: AuthService, useValue: auth }, { provide: JwtService, useValue: jwt }],
    exports: [AuthService, JwtService],
  })(AuthFixture);

  class ApiFixture {}
  Module({
    imports: [AuthFixture],
    controllers: [CallCenterController],
    providers: [
      AuthAttemptsGuard,
      { provide: CallCenterService, useValue: { claim: () => ({ requestId: advisor.id }) } },
    ],
  })(ApiFixture);

  const app = await NestFactory.create(ApiFixture, { logger: false, abortOnError: false });
  app.set('trust proxy', trustLocalProxy);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  t.after(() => app.close());
  const express = app.getHttpAdapter().getInstance();

  return function post(path, body, ip, { peerAddress = '127.0.0.1', bearer } = {}) {
    return new Promise((resolve, reject) => {
      const payload = Buffer.from(JSON.stringify(body));
      const socket = new PassThrough();
      socket.remoteAddress = peerAddress;
      const req = new IncomingMessage(socket);
      req.method = 'POST';
      req.url = path;
      req.headers = {
        'content-type': 'application/json', 'content-length': String(payload.length),
        'x-forwarded-for': ip,
        ...(bearer && { authorization: `Bearer ${token}` }),
      };
      const res = new ServerResponse(req);
      // Complete the response after Express sets its status and headers, without a TCP socket.
      res.end = () => {
        res.emit('finish');
        return res;
      };
      res.on('error', reject);
      res.on('finish', () => resolve({ status: res.statusCode, retryAfter: res.getHeader('Retry-After') }));
      express(req, res);
      req.push(payload);
      req.push(null);
    });
  };
}

const wrongCredentials = { email: 'otra-cuenta@example.test', password };
const validCredentials = { email: 'asesor@example.test', password };

test('el proxy local separa IP y Express se detiene en el primer salto', { timeout: 5000 }, async (t) => {
  const post = await startApi(t);
  for (let attempt = 0; attempt < 10; attempt++) {
    const ip = `198.51.100.${attempt + 1}, 203.0.113.1`;
    assert.equal((await post('/auth/login', wrongCredentials, ip)).status, 401);
  }
  const limited = await post('/auth/login', wrongCredentials, '198.51.100.99, 203.0.113.1');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.retryAfter) > 0);
  assert.equal((await post('/auth/login', validCredentials, '203.0.113.2')).status, 200);
});

test('una conexión no confiable conserva su contador aunque cambie X-Forwarded-For', { timeout: 5000 }, async (t) => {
  const post = await startApi(t);
  const peer = { peerAddress: '192.0.2.1' };
  for (let attempt = 1; attempt <= 11; attempt++) {
    const credentials = { ...wrongCredentials, email: `cuenta-${attempt}@example.test` };
    const result = await post('/auth/login', credentials, `203.0.113.${attempt}`, peer);
    assert.equal(result.status, attempt <= 10 ? 401 : 429);
  }
});

test('los logins exitosos liberan solo su intento; el registro y el canje siguen contando', { timeout: 5000 }, async (t) => {
  const post = await startApi(t);
  const ip = '203.0.113.3';
  for (let attempt = 0; attempt < 9; attempt++) {
    assert.equal((await post('/auth/login', wrongCredentials, ip)).status, 401);
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    assert.equal((await post('/auth/login', validCredentials, ip)).status, 200);
  }
  const registration = { ...validCredentials, firstName: 'Alex', lastName: 'Ejemplo' };
  assert.equal((await post('/auth/register', registration, ip)).status, 201);
  assert.equal((await post('/auth/login', validCredentials, ip)).status, 429);

  assert.equal((await post('/call-center/claim', { code }, ip)).status, 401);
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await post('/call-center/claim', { code }, ip, { bearer: true })).status, 200);
  }
  const limited = await post('/call-center/claim', { code }, ip, { bearer: true });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.retryAfter) > 0);
});

test('los logins en curso mantienen reservado el cupo', { timeout: 5000 }, async (t) => {
  const ip = '203.0.113.4';
  let release;
  let enteredLogin;
  const held = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { enteredLogin = resolve; });
  const post = await startApi(t, () => {
    enteredLogin();
    return held;
  });
  for (let attempt = 0; attempt < 9; attempt++) {
    assert.equal((await post('/auth/login', wrongCredentials, ip)).status, 401);
  }
  const pending = post('/auth/login', validCredentials, ip);
  try {
    await entered;
    assert.equal((await post('/auth/login', wrongCredentials, ip)).status, 429);
  } finally {
    release();
    assert.equal((await pending).status, 200);
  }
  assert.equal((await post('/auth/login', wrongCredentials, ip)).status, 401);
});
