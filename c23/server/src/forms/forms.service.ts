import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Form, FormDocument } from './form.schema';
import { FormComponent, UserRole, FormPermission } from '../common/interfaces';

@Injectable()
export class FormsService {
  constructor(@InjectModel(Form.name) private formModel: Model<FormDocument>) {}

  private checkPermission(form: FormDocument, userRole: UserRole, permission: FormPermission): boolean {
    const permissions = form.permissions;
    if (!permissions) {
      return true;
    }
    const allowedRoles = permissions[permission];
    if (!allowedRoles) {
      return true;
    }
    return allowedRoles.includes(userRole);
  }

  async create(
    name: string,
    description: string,
    components: FormComponent[],
    createdBy: string,
  ): Promise<FormDocument> {
    const createdForm = new this.formModel({
      name,
      description,
      components,
      createdBy: new Types.ObjectId(createdBy),
    });
    return createdForm.save();
  }

  async findAll(userRole: UserRole): Promise<FormDocument[]> {
    const forms = await this.formModel.find()
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .exec();
    return forms.filter((form) => this.checkPermission(form, userRole, FormPermission.VIEW));
  }

  async findOne(id: string, userRole: UserRole): Promise<FormDocument> {
    const form = await this.formModel.findById(id)
      .populate('createdBy', 'username')
      .exec();
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    if (!this.checkPermission(form, userRole, FormPermission.VIEW)) {
      throw new ForbiddenException('没有查看权限');
    }
    return form;
  }

  async update(
    id: string,
    name: string,
    description: string,
    components: FormComponent[],
    permissions: any,
    userRole: UserRole,
  ): Promise<FormDocument> {
    const form = await this.formModel.findById(id).exec();
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    if (!this.checkPermission(form, userRole, FormPermission.EDIT)) {
      throw new ForbiddenException('没有编辑权限');
    }
    form.name = name;
    form.description = description;
    form.components = components;
    if (permissions) {
      form.permissions = permissions;
    }
    return form.save();
  }

  async remove(id: string, userRole: UserRole): Promise<void> {
    const form = await this.formModel.findById(id).exec();
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    if (!this.checkPermission(form, userRole, FormPermission.EDIT)) {
      throw new ForbiddenException('没有删除权限');
    }
    await this.formModel.findByIdAndDelete(id).exec();
  }

  async canSubmit(id: string, userRole: UserRole): Promise<boolean> {
    const form = await this.formModel.findById(id).exec();
    if (!form || !form.isActive) {
      return false;
    }
    return this.checkPermission(form, userRole, FormPermission.SUBMIT);
  }
}
