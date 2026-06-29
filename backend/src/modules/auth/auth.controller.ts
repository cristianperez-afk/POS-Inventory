import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './login.dto';
import { Public } from './public.decorator';
import { AuthenticatedUser } from '../../shared/common/types';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const csrfCookieOptions = {
  ...cookieOptions,
  httpOnly: false,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto.email, loginDto.password, loginDto.rememberMe);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, this.generateCsrfToken());
    return { user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refresh(req.cookies?.refresh_token);
    this.setAuthCookies(res, result.accessToken, result.refreshToken, req.cookies?.csrf_token ?? this.generateCsrfToken());
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(user);
    this.clearAuthCookies(res);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getSession(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!req.cookies?.csrf_token) {
      this.setCsrfCookie(res, this.generateCsrfToken());
    }
    return this.authService.getSession(user);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken?: string | null, csrfToken?: string) {
    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 30 * 60 * 1000,
    });

    if (csrfToken) {
      this.setCsrfCookie(res, csrfToken);
    }

    if (refreshToken) {
      res.cookie('refresh_token', refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    } else {
      res.clearCookie('refresh_token', cookieOptions);
    }
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
    res.clearCookie('csrf_token', csrfCookieOptions);
  }

  private setCsrfCookie(res: Response, csrfToken: string) {
    res.cookie('csrf_token', csrfToken, {
      ...csrfCookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private generateCsrfToken() {
    return randomBytes(32).toString('base64url');
  }
}
