function maintenanceCheck(req, res, next) {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  // Allow health checks and status routes through
  const allowedPaths = ['/health', '/status/ping'];
  if (allowedPaths.includes(req.path)) return next();
  
  if (isMaintenanceMode) {
    return res.status(503).json({
      error: 'maintenance',
      message: 'System is temporarily offline for maintenance. Bot operations continue normally.',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
}

module.exports = { maintenanceCheck };
