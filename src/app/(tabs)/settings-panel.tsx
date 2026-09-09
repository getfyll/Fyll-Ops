import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import TeamManagementScreen from '@/app/team';
import InvitationsScreen from '@/app/invitations';
import BusinessSettingsScreen from '@/app/business-settings';
import StorefrontSettingsScreen from '@/app/storefront-settings';
import WooCommerceSettingsScreen from '@/app/woocommerce-settings';
import OrderAutomationScreen from '@/app/order-automation';
import EmailSettingsScreen from '@/app/email-settings';
import AccountSettingsScreen from '@/app/account-settings';
import DebugBusinessScreen from '@/app/debug-business';
import CategoryManagerScreen from '@/app/category-manager';
import ProductVariablesScreen from '@/app/product-variables';
import ImportProductsScreen from '@/app/import-products';
import ImportCustomersScreen from '@/app/import-customers';
import ImportOrdersScreen from '@/app/import-orders';
import ImportAiScreen from '@/app/import-ai';
import CasesScreen from '@/app/(tabs)/cases';
import CustomersScreen from '@/app/(tabs)/customers';
import ServicesScreen from '@/app/(tabs)/services';
import InsightsScreen from '@/app/(tabs)/insights';
import FinanceScreen from '@/app/(tabs)/finance';
import TasksScreen from '@/app/(tabs)/tasks';
import WarehouseSettingsScreen from '@/app/warehouse-settings';
import PlatformAdminScreen from '@/app/platform-admin';

export default function SettingsPanelScreen() {
  const { panel } = useLocalSearchParams<{ panel?: string | string[] }>();
  const panelName = Array.isArray(panel) ? panel[0] : panel;

  switch (panelName) {
    case 'team':
      return <TeamManagementScreen />;
    case 'invitations':
      return <InvitationsScreen />;
    case 'business-settings':
      return <BusinessSettingsScreen />;
    case 'storefront-settings':
      return <StorefrontSettingsScreen />;
    case 'woocommerce-settings':
      return <WooCommerceSettingsScreen />;
    case 'order-automation':
      return <OrderAutomationScreen />;
    case 'email-settings':
      return <EmailSettingsScreen />;
    case 'account-settings':
      return <AccountSettingsScreen />;
    case 'debug-business':
      return <DebugBusinessScreen />;
    case 'category-manager':
      return <CategoryManagerScreen />;
    case 'product-variables':
      return <ProductVariablesScreen />;
    case 'import-products':
      return <ImportProductsScreen />;
    case 'import-customers':
      return <ImportCustomersScreen />;
    case 'import-orders':
      return <ImportOrdersScreen />;
    case 'import-ai':
      return <ImportAiScreen />;
    case 'cases':
      return <CasesScreen />;
    case 'customers':
      return <CustomersScreen />;
    case 'services':
      return <ServicesScreen />;
    case 'insights':
      return <InsightsScreen />;
    case 'finance':
      return <FinanceScreen />;
    case 'tasks':
      return <TasksScreen />;
    case 'warehouse-settings':
      return <WarehouseSettingsScreen />;
    case 'platform-admin':
      return <PlatformAdminScreen />;
    default:
      return <Redirect href="/settings" />;
  }
}
