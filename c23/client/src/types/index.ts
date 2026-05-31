export enum UserRole {
  ADMIN = 'admin',
  DESIGNER = 'designer',
  VIEWER = 'viewer',
}

export interface User {
  id: string;
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
  conditionalRender?: ConditionalRule;
}

export interface ConditionalRule {
  enabled: boolean;
  conditions: ConditionItem[];
  logic: 'and' | 'or';
  action: 'show' | 'hide';
}

export interface ConditionItem {
  fieldId: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'in';
  value: any;
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

export interface Form {
  _id: string;
  name: string;
  description: string;
  components: FormComponent[];
  createdBy: User;
  permissions: {
    edit: UserRole[];
    view: UserRole[];
    submit: UserRole[];
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  _id: string;
  formId: string;
  data: Record<string, any>;
  submittedBy?: User;
  createdAt: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface ComponentTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  component?: Partial<FormComponent>;
  components?: Partial<FormComponent>[];
}
