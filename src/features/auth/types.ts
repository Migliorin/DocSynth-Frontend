export interface User {
  name: string
  email: string
  role: 'USER' | 'ADMIN'
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
  refreshExpiresAt: string
}
