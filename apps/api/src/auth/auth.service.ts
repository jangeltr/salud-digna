import { randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { Prisma } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../persistence/prisma.service';
import { JWT_CONFIG, type JwtConfig } from './auth.config';
import { AccountDto, LoginDto, LoginResponseDto, RegisterDto } from './auth.dto';
import { hashPassword } from './credentials';

const publicUser = { id: true, email: true, role: true } satisfies Prisma.UserSelect;
const account = {
  ...publicUser,
  isActive: true,
  patientId: true,
  patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(JWT_CONFIG) private readonly config: JwtConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  }

  async register(input: RegisterDto): Promise<AccountDto> {
    const { firstName, lastName, email, password, phone } = input;
    const passwordHash = await hashPassword(password);

    try {
      // Prisma realiza la escritura anidada del usuario y paciente en una transacción.
      return await this.prisma.client.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.PATIENT,
          patient: { create: { firstName, lastName, email, phone } },
        },
        select: account,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('No se pudo registrar la cuenta con este correo.');
      }
      throw error;
    }
  }

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { ...publicUser, isActive: true, passwordHash: true },
    });

    const validPassword = await verify(user?.passwordHash ?? this.dummyHash, input.password).catch(() => false);
    if (!user?.isActive || !user.passwordHash || !validPassword) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const { id, email, role } = user;
    return {
      accessToken: await this.jwt.signAsync({ sub: id, role }),
      tokenType: 'Bearer',
      expiresIn: this.config.expiresIn,
      user: { id, email, role },
    };
  }

  findActiveAccount(id: string): Promise<AccountDto | null> {
    return this.prisma.client.user.findUnique({
      where: { id, isActive: true },
      select: account,
    });
  }
}
