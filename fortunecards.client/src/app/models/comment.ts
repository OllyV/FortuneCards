export enum CommentTargetType {
  Deck = 0,
  Card = 1,
  Pattern = 2,
}

export interface CommentDto {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  parentCommentId: number | null;
  body: string | null;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  authorUserId: number | null;
  authorName: string;
  authorAvatarUrl: string | null;
  isMine: boolean;
  replyCount: number;
  replies: CommentDto[];
}

export interface MyCommentDto {
  id: number;
  targetType: CommentTargetType;
  targetId: number;
  body: string | null;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  targetLabel: string;
  targetRoute: string;
}

export interface CreateCommentInput {
  targetType: CommentTargetType;
  targetId: number;
  parentCommentId?: number | null;
  body: string;
}
