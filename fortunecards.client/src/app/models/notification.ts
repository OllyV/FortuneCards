import { CommentTargetType } from './comment';

export enum NotificationType {
  Reply = 0,
  CommentOnContent = 1,
}

export interface NotificationDto {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  actorUserId: number | null;
  actorName: string;
  actorAvatarUrl: string | null;
  commentId: number;
  targetType: CommentTargetType;
  targetId: number;
  targetRoute: string;
  commentSnippet: string | null;
}
