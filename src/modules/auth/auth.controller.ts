import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { sendSuccess, sendCreated, sendValidationError } from '../../utils/response';
import { validate, verifyTokenSchema } from '../../utils/validators';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/auth/register
   * Create account using phone number, password, and username.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, password, username, role } = req.body as {
        phone?: string;
        password?: string;
        username?: string;
        role?: any;
      };

      if (!phone) {
        sendValidationError(res, 'Mobile phone number is required');
        return;
      }
      if (!password || password.length < 6) {
        sendValidationError(res, 'Password must be at least 6 characters');
        return;
      }
      if (!username) {
        sendValidationError(res, 'Username is required');
        return;
      }

      const result = await authService.registerWithPassword({ phone, password, username, role });
      sendCreated(res, result, 'Account created successfully! Welcome to JustGO.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/login
   * Log in using phone number and password.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, password, role } = req.body as {
        phone?: string;
        password?: string;
        role?: any;
      };

      if (!phone || !password) {
        sendValidationError(res, 'Both phone number and password are required');
        return;
      }

      const result = await authService.loginWithPassword({ phone, password, role });
      sendSuccess(res, result, 'Signed in successfully! Welcome back.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/send-otp
   * Send 6-digit SMS OTP to Indian phone number.
   */
  async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.body as { phone?: string };
      if (!phone) {
        sendValidationError(res, 'Mobile phone number is required');
        return;
      }
      const result = await authService.sendPhoneOtp(phone);
      sendSuccess(res, result, result.message);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/verify-otp
   * Verify the 6-digit OTP code and retrieve/initiate user session.
   */
  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp, role } = req.body as { phone?: string; otp?: string; role?: any };
      if (!phone || !otp) {
        sendValidationError(res, 'Both phone and OTP are required');
        return;
      }
      const result = await authService.verifyPhoneOtp(phone, otp, role || 'passenger');
      if (result.isNewUser) {
        sendCreated(res, result, 'OTP verified. Please choose your username to complete registration.');
      } else {
        sendSuccess(res, result, 'Welcome back to JustGO! Logged in successfully.');
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/check-username
   * Check if desired username is available.
   */
  async checkUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.body as { username?: string };
      if (!username) {
        sendValidationError(res, 'Username is required');
        return;
      }
      const result = await authService.checkUsernameAvailable(username);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/create-username
   * Save username for newly verified phone user and activate full profile.
   */
  async createUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.user?.userId || req.body.userId) as string;
      const { username, role } = req.body as { username?: string; role?: any };

      if (!userId) {
        sendValidationError(res, 'User identity is required');
        return;
      }
      if (!username) {
        sendValidationError(res, 'Username is required');
        return;
      }

      const result = await authService.completeUsername(userId, username, role);
      sendCreated(res, result, 'Account created successfully! Welcome to JustGO.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/verify
   * Legacy / Firebase token verify endpoint.
   */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { error, value } = validate(verifyTokenSchema, req.body);
      if (error) {
        sendValidationError(res, error.details.map((d) => d.message).join(', '));
        return;
      }

      const result = await authService.verifyAndRegister(value);
      if (result.isNewUser) {
        sendCreated(res, result, 'Account created successfully');
      } else {
        sendSuccess(res, result, 'Sign in successful');
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/auth/refresh
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken } = req.body as { idToken?: string };
      if (!idToken) {
        sendValidationError(res, 'idToken is required');
        return;
      }

      const result = await authService.refreshSession(idToken);
      sendSuccess(res, result, 'Session refreshed');
    } catch (err) {
      next(err);
    }
  }
}
