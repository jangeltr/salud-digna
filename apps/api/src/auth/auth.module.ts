import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../persistence/prisma.module';
import { AuthAttemptsGuard } from './auth-attempts.guard';
import { JWT_CONFIG, loadJwtConfig, type JwtConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [{ provide: JWT_CONFIG, useFactory: loadJwtConfig }],
  exports: [JWT_CONFIG],
})
class AuthConfigModule {}

@Module({
  imports: [
    PrismaModule,
    AuthConfigModule,
    JwtModule.registerAsync({
      imports: [AuthConfigModule],
      inject: [JWT_CONFIG],
      useFactory: ({ secret, expiresIn }: JwtConfig) => ({
        secret,
        signOptions: { algorithm: 'HS256', expiresIn },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthAttemptsGuard, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard, JwtModule, AuthService],
})
export class AuthModule {}
