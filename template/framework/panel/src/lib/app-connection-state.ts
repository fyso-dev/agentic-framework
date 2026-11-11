type Catalog={configured:boolean};
type Accounts={configured:boolean;inventoryComplete?:boolean;services:Record<string,{connected:boolean;pending?:boolean;accounts?:{status:string}[]}>};
export function appConnectionState(catalog:Catalog|undefined,accounts:Accounts|undefined,slug:string) {
  if(catalog?.configured===false || accounts?.configured===false)return 'needsSetup';
  if(!catalog || !accounts)return 'unknownState';
  const state=accounts.services[slug];
  if(state?.connected)return 'connected';
  if(state?.pending||state?.accounts?.some(account=>accountConnectionState(account.status)==='accountPending'))return 'pending';
  if(state?.accounts?.length)return state.accounts.some(account=>['accountUnknown','accountActive'].includes(accountConnectionState(account.status)))?'unknownState':'needsAttention';
  if(accounts.inventoryComplete===false)return 'unknownState';
  return 'notConnected';
}

export function accountConnectionState(status:string) {
  switch(status.toLowerCase()) {
    case 'active':return 'accountActive';
    case 'initiated':case 'initializing':case 'pending':return 'accountPending';
    case 'expired':return 'accountExpired';
    case 'failed':case 'error':case 'rejected':return 'accountFailed';
    case 'inactive':case 'disabled':case 'revoked':return 'accountInactive';
    default:return 'accountUnknown';
  }
}
