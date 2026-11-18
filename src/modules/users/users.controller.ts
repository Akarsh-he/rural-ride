import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service';
import { sendSuccess, sendValidationError, sendNotFound } from '../../utils/response';

const userSvc = new UsersService();

export class UsersController {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userSvc.getMe(req.user!.userId);
      if (!user) return sendNotFound(res, 'User not found');
      sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  }

  async updateLanguage(req: Request, res: Response, next: NextFunction) {
    try {
      const { language } = req.body;
      if (!language || !['hi', 'en'].includes(language)) {
        return sendValidationError(res, 'Language must be hi or en');
      }
      await userSvc.updateLanguage(req.user!.userId, language);
      sendSuccess(res, null, 'Language preference updated');
    } catch (err) {
      next(err);
    }
  }

  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      await userSvc.deleteAccount(req.user!.userId);
      sendSuccess(res, null, 'Account deleted');
    } catch (err) {
      next(err);
    }
  }
}
