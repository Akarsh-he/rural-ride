import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { validate, verifyTokenSchema } from '../../utils/validators';
import { sendValidationError } from '../../utils/response';

const authService = new AuthService();

export class AuthController {
  /**
   * POST /api/auth/verify
   * Verify Firebase token, create or find user, return profile.
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
   * Validate a fresh Firebase token and return current user info.
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
