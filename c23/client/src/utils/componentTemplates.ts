import type { ComponentTemplate, FormComponent } from '@/types';

export const componentTemplates: ComponentTemplate[] = [
  {
    id: 'basic-info',
    name: '基础信息组',
    category: '常用组件',
    icon: 'User',
    description: '姓名、电话、邮箱',
    component: {
      type: 'text',
    },
    components: [
      { type: 'text', label: '姓名', required: true, placeholder: '请输入姓名' },
      { type: 'text', label: '联系电话', required: true, placeholder: '请输入手机号', rules: [{ type: 'pattern', value: '^1[3-9]\\d{9}$', message: '请输入正确的手机号' }] },
      { type: 'text', label: '邮箱', required: false, placeholder: '请输入邮箱', rules: [{ type: 'email', message: '请输入正确的邮箱' }] },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'address',
    name: '地址选择器',
    category: '常用组件',
    icon: 'Location',
    description: '省市区级联选择',
    component: {
      type: 'cascader',
    },
    components: [
      {
        type: 'cascader',
        label: '所在地区',
        required: true,
        placeholder: '请选择省/市/区',
        options: [
          {
            label: '北京市',
            value: 'beijing',
            children: [
              { label: '东城区', value: 'dongcheng' },
              { label: '西城区', value: 'xicheng' },
              { label: '朝阳区', value: 'chaoyang' },
              { label: '海淀区', value: 'haidian' },
            ],
          },
          {
            label: '上海市',
            value: 'shanghai',
            children: [
              { label: '黄浦区', value: 'huangpu' },
              { label: '徐汇区', value: 'xuhui' },
              { label: '浦东新区', value: 'pudong' },
            ],
          },
          {
            label: '广东省',
            value: 'guangdong',
            children: [
              {
                label: '广州市',
                value: 'guangzhou',
                children: [
                  { label: '越秀区', value: 'yuexiu' },
                  { label: '天河区', value: 'tianhe' },
                ],
              },
              {
                label: '深圳市',
                value: 'shenzhen',
                children: [
                  { label: '福田区', value: 'futian' },
                  { label: '南山区', value: 'nanshan' },
                ],
              },
            ],
          },
        ],
      },
      { type: 'textarea', label: '详细地址', required: true, placeholder: '请输入详细地址' },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'gender',
    name: '性别选择',
    category: '常用组件',
    icon: 'UserFilled',
    description: '单选框：男/女',
    component: {
      type: 'radio',
    },
    components: [
      {
        type: 'radio',
        label: '性别',
        required: true,
        options: [
          { label: '男', value: 'male' },
          { label: '女', value: 'female' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'birthday',
    name: '出生日期',
    category: '常用组件',
    icon: 'Calendar',
    description: '日期选择器',
    component: {
      type: 'date',
    },
    components: [
      { type: 'date', label: '出生日期', required: true, placeholder: '选择出生日期' },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'id-card',
    name: '身份证号',
    category: '常用组件',
    icon: 'Postcard',
    description: '带校验的身份证输入',
    component: {
      type: 'text',
    },
    components: [
      {
        type: 'text',
        label: '身份证号',
        required: true,
        placeholder: '请输入18位身份证号',
        rules: [
          { type: 'pattern', value: '^[1-9]\\d{5}(19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]$', message: '请输入正确的身份证号' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'education',
    name: '学历选择',
    category: '业务组件',
    icon: 'Reading',
    description: '下拉框选择学历',
    component: {
      type: 'select',
    },
    components: [
      {
        type: 'select',
        label: '最高学历',
        required: true,
        placeholder: '请选择学历',
        options: [
          { label: '高中及以下', value: 'high_school' },
          { label: '大专', value: 'college' },
          { label: '本科', value: 'bachelor' },
          { label: '硕士', value: 'master' },
          { label: '博士及以上', value: 'doctor' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'work-experience',
    name: '工作年限',
    category: '业务组件',
    icon: 'OfficeBuilding',
    description: '下拉框选择工作年限',
    component: {
      type: 'select',
    },
    components: [
      {
        type: 'select',
        label: '工作年限',
        required: true,
        placeholder: '请选择工作年限',
        options: [
          { label: '应届毕业生', value: 'fresh' },
          { label: '1年以内', value: '1_year' },
          { label: '1-3年', value: '1_3_years' },
          { label: '3-5年', value: '3_5_years' },
          { label: '5-10年', value: '5_10_years' },
          { label: '10年以上', value: '10_years_plus' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'salary-range',
    name: '薪资范围',
    category: '业务组件',
    icon: 'Wallet',
    description: '下拉框选择薪资范围',
    component: {
      type: 'select',
    },
    components: [
      {
        type: 'select',
        label: '期望薪资',
        required: true,
        placeholder: '请选择薪资范围',
        options: [
          { label: '5k以下', value: 'below_5k' },
          { label: '5k-10k', value: '5k_10k' },
          { label: '10k-20k', value: '10k_20k' },
          { label: '20k-30k', value: '20k_30k' },
          { label: '30k-50k', value: '30k_50k' },
          { label: '50k以上', value: 'above_50k' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'feedback-type',
    name: '反馈类型',
    category: '业务组件',
    icon: 'ChatDotRound',
    description: '问题类型选择',
    component: {
      type: 'select',
    },
    components: [
      {
        type: 'select',
        label: '反馈类型',
        required: true,
        placeholder: '请选择反馈类型',
        options: [
          { label: '产品建议', value: 'suggestion' },
          { label: '功能问题', value: 'bug' },
          { label: '使用咨询', value: 'consultation' },
          { label: '其他', value: 'other' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'satisfaction',
    name: '满意度评分',
    category: '业务组件',
    icon: 'Star',
    description: '1-5分评分选择',
    component: {
      type: 'radio',
    },
    components: [
      {
        type: 'radio',
        label: '满意度',
        required: true,
        options: [
          { label: '非常满意', value: '5' },
          { label: '满意', value: '4' },
          { label: '一般', value: '3' },
          { label: '不满意', value: '2' },
          { label: '非常不满意', value: '1' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'hobbies',
    name: '兴趣爱好',
    category: '业务组件',
    icon: 'PictureFilled',
    description: '多选框选择爱好',
    component: {
      type: 'checkbox',
    },
    components: [
      {
        type: 'checkbox',
        label: '兴趣爱好',
        required: false,
        options: [
          { label: '阅读', value: 'reading' },
          { label: '运动', value: 'sports' },
          { label: '音乐', value: 'music' },
          { label: '电影', value: 'movie' },
          { label: '旅行', value: 'travel' },
          { label: '美食', value: 'food' },
        ],
      },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'emergency-contact',
    name: '紧急联系人',
    category: '业务组件',
    icon: 'PhoneFilled',
    description: '姓名和电话',
    component: {
      type: 'text',
    },
    components: [
      { type: 'text', label: '紧急联系人', required: true, placeholder: '请输入姓名' },
      {
        type: 'text',
        label: '联系电话',
        required: true,
        placeholder: '请输入手机号',
        rules: [{ type: 'pattern', value: '^1[3-9]\\d{9}$', message: '请输入正确的手机号' }],
      },
      { type: 'text', label: '与本人关系', required: true, placeholder: '如：父母、配偶、朋友' },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'registration-form',
    name: '报名登记表',
    category: '完整模板',
    icon: 'Document',
    description: '活动报名完整表单',
    component: {
      type: 'text',
    },
    components: [
      { type: 'text', label: '姓名', required: true, placeholder: '请输入姓名' },
      {
        type: 'radio',
        label: '性别',
        required: true,
        options: [
          { label: '男', value: 'male' },
          { label: '女', value: 'female' },
        ],
      },
      { type: 'date', label: '出生日期', required: true, placeholder: '选择出生日期' },
      {
        type: 'text',
        label: '联系电话',
        required: true,
        placeholder: '请输入手机号',
        rules: [{ type: 'pattern', value: '^1[3-9]\\d{9}$', message: '请输入正确的手机号' }],
      },
      {
        type: 'text',
        label: '邮箱',
        required: false,
        placeholder: '请输入邮箱',
        rules: [{ type: 'email', message: '请输入正确的邮箱' }],
      },
      { type: 'textarea', label: '备注说明', required: false, placeholder: '有其他信息请在此填写' },
    ] as Partial<FormComponent>[],
  },
  {
    id: 'feedback-form',
    name: '意见反馈表',
    category: '完整模板',
    icon: 'ChatLineRound',
    description: '用户反馈收集表单',
    component: {
      type: 'text',
    },
    components: [
      { type: 'text', label: '您的姓名', required: false, placeholder: '选填' },
      {
        type: 'text',
        label: '联系电话',
        required: false,
        placeholder: '选填，便于我们联系您',
        rules: [{ type: 'pattern', value: '^1[3-9]\\d{9}$', message: '请输入正确的手机号' }],
      },
      {
        type: 'select',
        label: '反馈类型',
        required: true,
        placeholder: '请选择反馈类型',
        options: [
          { label: '产品建议', value: 'suggestion' },
          { label: '功能问题', value: 'bug' },
          { label: '使用咨询', value: 'consultation' },
          { label: '其他', value: 'other' },
        ],
      },
      { type: 'textarea', label: '反馈内容', required: true, placeholder: '请详细描述您的反馈' },
    ] as Partial<FormComponent>[],
  },
];

export function getTemplateCategories() {
  const categories = new Set<string>();
  componentTemplates.forEach(t => categories.add(t.category));
  return Array.from(categories);
}

export function getTemplatesByCategory(category: string) {
  return componentTemplates.filter(t => t.category === category);
}
