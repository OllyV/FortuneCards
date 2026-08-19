export interface UserDto {
  id: number;
  email: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
}
