import { UserRole } from '../generated/prisma/enums';
import { runStaffAccountCommand } from './create-staff-account';

runStaffAccountCommand(UserRole.ADVISOR);
