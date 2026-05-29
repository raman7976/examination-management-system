import jwt from 'jsonwebtoken';

export const protect = async (req, res, next) => {
    let token;
console.log("HIT! Headers received:", req.headers.authorization);
    // 1. Check if the token exists in the headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header (Format is "Bearer <token>")
            token = req.headers.authorization.split(' ')[1];

            // 2. Verify the token using your secret key from the .env file
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Attach the decoded user data to the request object
            // This allows your controllers to know EXACTLY who is making the request
            req.user = decoded;

            // Move to the next function (the actual route controller)
            return next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({ success: false, message: 'Not authorized, token failed or expired' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    next();
};

// Gate routes that should ONLY be reachable by an invigilator (faculty / phd_student /
// lab_staff). Admins are explicitly bounced — they have their own dashboard endpoints
// for the same data, so misrouting one here is a configuration smell worth surfacing.
export const requireInvigilator = (req, res, next) => {
    if (req.user?.role === 'admin')
        return res.status(403).json({
            success: false,
            message: 'Invigilator access required (admins use the admin endpoints).',
        });
    if (!['faculty', 'phd_student', 'lab_staff'].includes(req.user?.role))
        return res.status(403).json({ success: false, message: 'Invigilator access required.' });
    next();
};