export enum UserRole {
  ADMIN = 'admin',
  DESIGNER = 'designer',
  VIEWER = 'viewer',
}

export enum FormPermission {
  EDIT = 'edit',
  VIEW = 'view',
  SUBMIT = 'submit',
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export interface FormComponent {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'cascader' | 'number' | 'radio' | 'checkbox';
  label: string;
  placeholder?: string;
  required?: boolean;
  rules?: ValidationRule[];
  options?: ComponentOption[];
  defaultValue?: any;
  disabled?: boolean;
  visible?: string;
  linkage?: LinkageRule[];
}

export interface ValidationRule {
  type?: 'required' | 'min' | 'max' | 'pattern' | 'email' | 'custom';
  value?: any;
  message?: string;
  validator?: string;
}

export interface ComponentOption {
  label: string;
  value: string | number;
  children?: ComponentOption[];
}

export interface LinkageRule {
  triggerField: string;
  condition: string;
  action: 'show' | 'hide' | 'enable' | 'disable' | 'setRequired';
  targetFields: string[];
}
