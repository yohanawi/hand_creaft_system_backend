const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed' });
  }
};

exports.optionalProtect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    return next();
  } catch (error) {
    req.user = null;
    return next();
  }
};

exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Admin access required' });
};

exports.seller = (req, res, next) => {
  if (req.user && req.user.role === 'seller') {
    if (req.user.sellerStatus && ['rejected', 'suspended'].includes(req.user.sellerStatus)) {
      return res.status(403).json({ message: 'Seller account is not active' });
    }
    return next();
  }
  return res.status(403).json({ message: 'Seller access required' });
};

exports.adminOrSeller = (req, res, next) => {
  if (req.user && ['admin', 'seller'].includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ message: 'Admin or seller access required' });
};
