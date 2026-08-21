export function temporaryPasswordAccessError(user: { mustChangePassword: boolean }) {
  return user.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : null;
}
