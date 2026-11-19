import { api, ApiError, currentUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/permissions";
import { repository } from "@/lib/repository";
import { filtersFrom } from "@/lib/dashboard";
import { customerMonthlyView } from "@/lib/customer-monthly";
export const dynamic="force-dynamic";
export async function GET(request:Request){return api(async()=>{
  const user=await currentUser();if(!canAccessModule(user,'overview'))throw new ApiError(403,'common.noAccess');
  return {ok:true,data:customerMonthlyView(await repository.read(),user,filtersFrom(new URL(request.url)))};
});}
