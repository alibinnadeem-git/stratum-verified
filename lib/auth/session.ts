import type {Role} from './permissions';
export type DemoSession={user:{id:string;name:string;email:string};organization:{id:string;name:string};role:Role};
export const demoSession:DemoSession={user:{id:'usr-ali',name:'Ali Bin Nadeem',email:'ali@stratumelectric.com'},organization:{id:'org-stratum',name:'STRATUM Electric'},role:'SUPER_ADMIN'};
