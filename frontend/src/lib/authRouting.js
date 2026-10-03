export const getAuthDestination = (user) => user?.active === false && user?.deletion_scheduled_at ? "/profile" : user?.role === "admin" ? "/admin" : "/home";
